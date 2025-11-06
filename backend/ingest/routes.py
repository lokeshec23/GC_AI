# ingest/routes.py
import os
import uuid
import tempfile
import json
from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from ingest.schemas import IngestResponse, ProcessingStatus
from ingest.processor import process_guideline_background
from settings.models import get_user_settings
from settings.routes import get_current_user_id
from utils.progress import get_progress, delete_progress, progress_store, progress_lock
from config import SUPPORTED_MODELS
import asyncio
from typing import AsyncGenerator
import base64

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
    """Upload PDF and extract rules using custom prompt"""
    
    print(f"📥 Received request:")
    print(f"  - File: {file.filename} ({file.content_type})")
    print(f"  - Provider: {model_provider}")
    print(f"  - Model: {model_name}")
    print(f"  - User ID: {user_id}")
    
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
    
    # Check API key
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
    print(f"🆔 Session: {session_id}")
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
        max_retries = 600
        
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


# ✅ Get preview data (JSON for table display)
# ✅ Get preview data (JSON for table display)
@router.get("/preview/{session_id}")
async def get_preview(session_id: str):
    """Get JSON preview data for display in UI table"""
    print(f"\n📥 Preview request for session: {session_id}")
    
    with progress_lock:
        # ✅ Debug: Check what's in progress_store
        print(f"   - Session exists in store: {session_id in progress_store}")
        
        if session_id not in progress_store:
            print(f"   ❌ Session not found in progress_store")
            print(f"   Available sessions: {list(progress_store.keys())[:5]}")  # Show first 5
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_data = progress_store[session_id]
        print(f"   - Session data keys: {list(session_data.keys())}")
        print(f"   - Has preview_data: {'preview_data' in session_data}")
        
        preview_data = session_data.get("preview_data")
        
        if not preview_data:
            print(f"   ❌ preview_data is empty or None")
            print(f"   Session data: {session_data}")
            raise HTTPException(status_code=404, detail="Preview data not available")
        
        print(f"   ✅ Returning preview data ({len(str(preview_data))} bytes)")
        return JSONResponse(content=preview_data)


# ✅ Get Excel file as base64 (for preview)
@router.get("/excel/{session_id}")
async def get_excel_base64(session_id: str):
    """Get Excel file as base64 for frontend preview/download"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        excel_path = progress_store[session_id].get("excel_path")
        
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(status_code=404, detail="Excel file not found")
    
    # Read Excel file and convert to base64
    with open(excel_path, 'rb') as f:
        excel_bytes = f.read()
        excel_base64 = base64.b64encode(excel_bytes).decode('utf-8')
    
    return JSONResponse({
        "filename": f"extraction_{session_id[:8]}.xlsx",
        "data": excel_base64,
        "size": len(excel_bytes)
    })


# ✅ Download Excel file directly
@router.get("/download/{session_id}")
async def download_excel(session_id: str):
    """Download the Excel file directly"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        excel_path = progress_store[session_id].get("excel_path")
        filename = progress_store[session_id].get("filename", f"extraction_{session_id[:8]}.xlsx")
        
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(status_code=404, detail="Result file not found")
    
    return FileResponse(
        excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# ✅ Cleanup endpoint (optional - called after download)
@router.delete("/cleanup/{session_id}")
async def cleanup_session_endpoint(session_id: str):
    """Manually cleanup session data"""
    with progress_lock:
        if session_id not in progress_store:
            return {"message": "Session already cleaned"}
        
        excel_path = progress_store[session_id].get("excel_path")
        
        # Delete Excel file
        if excel_path and os.path.exists(excel_path):
            os.remove(excel_path)
            print(f"🧹 Cleaned up Excel: {excel_path}")
        
        # Remove from store
        del progress_store[session_id]
    
    return {"message": "Session cleaned successfully"}