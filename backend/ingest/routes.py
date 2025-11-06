# ingest/routes.py
import os
import uuid
import tempfile
from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse
from ingest.schemas import IngestResponse, ProcessingStatus
from ingest.processor import process_guideline_background
from settings.models import get_user_settings
from settings.routes import get_current_user_id
from utils.progress import get_progress, delete_progress, progress_store, progress_lock
from config import SUPPORTED_MODELS
import asyncio
import json
from typing import AsyncGenerator

router = APIRouter(prefix="/ingest", tags=["Ingest Guideline"])

@router.post("/guideline", response_model=IngestResponse)
async def ingest_guideline(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_provider: str = Form(...),
    model_name: str = Form(...),
    custom_prompt: str = Form(...),
    user_id: str = Depends(get_current_user_id)
):
    """
    Upload PDF and extract rules using custom prompt.
    Returns session_id for progress tracking.
    """
    
    # Validate model
    if model_provider not in SUPPORTED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {model_provider}")
    
    if model_name not in SUPPORTED_MODELS[model_provider]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model '{model_name}' for provider '{model_provider}'"
        )
    
    # Get user settings
    settings = await get_user_settings(user_id)
    if not settings:
        raise HTTPException(
            status_code=404,
            detail="Please configure your settings first (API keys required)"
        )
    
    # Check if API key exists for selected provider
    api_key = settings.get(f"{model_provider}_api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {model_provider}. Please add it in Settings."
        )
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    print(f"\n{'='*60}")
    print(f"📥 File upload: {file.filename}")
    print(f"🆔 Session: {session_id}")
    print(f"👤 User: {user_id}")
    print(f"{'='*60}\n")
    
    # Save PDF temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_pdf:
        content = await file.read()
        tmp_pdf.write(content)
        pdf_path = tmp_pdf.name
        file_size_mb = len(content) / (1024 * 1024)
        print(f"📄 File saved: {file_size_mb:.2f} MB")
    
    # Initialize progress
    from utils.progress import update_progress
    update_progress(session_id, 0, "Starting processing...")
    
    # Start background processing
    background_tasks.add_task(
        process_guideline_background,
        session_id=session_id,
        pdf_path=pdf_path,
        filename=file.filename,
        user_settings=settings,
        model_provider=model_provider,
        model_name=model_name,
        custom_prompt=custom_prompt
    )
    
    return IngestResponse(
        status="processing",
        message="Processing started",
        session_id=session_id
    )


@router.get("/progress/{session_id}")
async def progress_stream(session_id: str):
    """Stream progress updates via Server-Sent Events"""
    async def event_generator() -> AsyncGenerator[str, None]:
        last_progress = -1
        retry_count = 0
        max_retries = 600  # 5 minutes timeout
        
        print(f"🔌 SSE connected: {session_id[:8]}")
        
        while retry_count < max_retries:
            progress_data = get_progress(session_id)
            current_progress = progress_data["progress"]
            
            if current_progress != last_progress:
                last_progress = current_progress
                yield f"data: {json.dumps(progress_data)}\n\n"
                retry_count = 0
                
                if current_progress >= 100:
                    await asyncio.sleep(0.5)
                    break
            
            await asyncio.sleep(0.5)
            retry_count += 1
        
        print(f"🔌 SSE closed: {session_id[:8]}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/status/{session_id}", response_model=ProcessingStatus)
async def get_status(session_id: str):
    """Get current processing status"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        data = progress_store[session_id]
        
        return ProcessingStatus(
            status=data.get("status", "processing"),
            progress=data["progress"],
            message=data["message"],
            result_url=f"/ingest/download/{session_id}" if data.get("excel_path") else None
        )


@router.get("/download/{session_id}")
async def download_result(session_id: str):
    """Download the generated Excel file"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        excel_path = progress_store[session_id].get("excel_path")
        
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(status_code=404, detail="Result file not found")
    
    # Return file and schedule cleanup
    return FileResponse(
        excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"extraction_{session_id[:8]}.xlsx",
        background=BackgroundTasks().add_task(cleanup_session, session_id, excel_path)
    )


def cleanup_session(session_id: str, excel_path: str):
    """Cleanup session data and temporary files"""
    # Delete Excel file
    if os.path.exists(excel_path):
        os.remove(excel_path)
        print(f"🧹 Cleaned up Excel: {excel_path}")
    
    # Delete progress data
    delete_progress(session_id)
    print(f"🧹 Cleaned up session: {session_id[:8]}")