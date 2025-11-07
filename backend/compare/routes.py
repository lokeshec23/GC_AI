# compare/routes.py
import os
import uuid
import tempfile
import json
from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from compare.schemas import CompareResponse, ComparisonStatus
from compare.processor import process_comparison_background
from settings.models import get_user_settings
from settings.routes import get_current_user_id
from utils.progress import get_progress, delete_progress, progress_store, progress_lock
from config import SUPPORTED_MODELS
import asyncio
from typing import AsyncGenerator

router = APIRouter(prefix="/compare", tags=["Compare Guidelines"])

@router.post("/guidelines", response_model=CompareResponse)
async def compare_guidelines(
    background_tasks: BackgroundTasks,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    model_provider: str = Form(...),
    model_name: str = Form(...),
    custom_prompt: str = Form(...),
    user_id: str = Depends(get_current_user_id)
):
    """Upload two Excel files and compare them using LLM"""
    
    print(f"📥 Comparison request received:")
    print(f"  - File 1: {file1.filename}")
    print(f"  - File 2: {file2.filename}")
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
    
    # Validate file types
    for file in [file1, file2]:
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=400,
                detail=f"Only Excel files (.xlsx, .xls) are supported. Got: {file.filename}"
            )
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    
    print(f"\n{'='*60}")
    print(f"🆔 Session: {session_id}")
    print(f"{'='*60}\n")
    
    # Save Excel files temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp1:
        content1 = await file1.read()
        tmp1.write(content1)
        file1_path = tmp1.name
        print(f"📄 File 1 saved: {len(content1) / 1024:.2f} KB")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp2:
        content2 = await file2.read()
        tmp2.write(content2)
        file2_path = tmp2.name
        print(f"📄 File 2 saved: {len(content2) / 1024:.2f} KB")
    
    # Initialize progress
    from utils.progress import update_progress
    update_progress(session_id, 0, "Starting comparison...")
    
    # Start background processing
    background_tasks.add_task(
        process_comparison_background,
        session_id=session_id,
        file1_path=file1_path,
        file2_path=file2_path,
        file1_name=file1.filename,
        file2_name=file2.filename,
        user_settings=settings,
        model_provider=model_provider,
        model_name=model_name,
        custom_prompt=custom_prompt
    )
    
    return CompareResponse(
        status="processing",
        message="Comparison started",
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


@router.get("/status/{session_id}", response_model=ComparisonStatus)
async def get_status(session_id: str):
    """Get current comparison status"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        data = progress_store[session_id]
        
        return ComparisonStatus(
            status=data.get("status", "processing"),
            progress=data["progress"],
            message=data["message"],
            result_url=f"/compare/download/{session_id}" if data.get("excel_path") else None
        )


@router.get("/preview/{session_id}")
async def get_preview(session_id: str):
    """Get JSON preview data"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        preview_data = progress_store[session_id].get("preview_data")
        
        if not preview_data:
            raise HTTPException(status_code=404, detail="Preview data not available")
        
        return JSONResponse(content=preview_data)


@router.get("/download/{session_id}")
async def download_result(session_id: str):
    """Download the comparison Excel file"""
    with progress_lock:
        if session_id not in progress_store:
            raise HTTPException(status_code=404, detail="Session not found")
        
        excel_path = progress_store[session_id].get("excel_path")
        filename = progress_store[session_id].get("filename", f"comparison_{session_id[:8]}.xlsx")
        
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