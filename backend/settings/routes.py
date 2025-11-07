# settings/routes.py
from fastapi import APIRouter, HTTPException, Header, Depends
from settings.models import get_user_settings, create_or_update_settings, delete_user_settings
from settings.schemas import SettingsUpdate, SettingsResponse
from auth.utils import verify_token
from config import SUPPORTED_MODELS
from datetime import datetime

router = APIRouter(prefix="/settings", tags=["Settings"])

async def get_current_user_id(authorization: str = Header(None)) -> str:
    """Extract user_id from JWT token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split(" ")[1]
    payload = verify_token(token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return payload.get("sub")

@router.get("", response_model=SettingsResponse)
async def get_settings(user_id: str = Depends(get_current_user_id)):
    """Get current user's settings"""
    settings = await get_user_settings(user_id)
    
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found. Please create settings first.")
    
    return SettingsResponse(
        user_id=str(settings["user_id"]),
        openai_api_key=settings.get("openai_api_key"),
        openai_endpoint=settings.get("openai_endpoint"),
        openai_deployment=settings.get("openai_deployment"),
        gemini_api_key=settings.get("gemini_api_key"),
        temperature=settings.get("temperature", 0.7),
        max_output_tokens=settings.get("max_output_tokens", 8192),
        top_p=settings.get("top_p", 1.0),
        stop_sequences=settings.get("stop_sequences", []),
        chunk_size=settings.get("chunk_size", 1500),
        chunk_overlap=settings.get("chunk_overlap", 200),
        updated_at=settings.get("updated_at", datetime.utcnow()).isoformat()
    )

@router.post("", response_model=SettingsResponse)
async def update_settings(
    settings_data: SettingsUpdate,
    user_id: str = Depends(get_current_user_id)
):
    """Create or update user settings"""
    settings_dict = settings_data.model_dump(exclude_unset=False)
    updated_settings = await create_or_update_settings(user_id, settings_dict)
    
    return SettingsResponse(
        user_id=str(updated_settings["user_id"]),
        openai_api_key=updated_settings.get("openai_api_key"),
        openai_endpoint=updated_settings.get("openai_endpoint"),
        openai_deployment=updated_settings.get("openai_deployment"),
        gemini_api_key=updated_settings.get("gemini_api_key"),
        temperature=updated_settings.get("temperature"),
        max_output_tokens=updated_settings.get("max_output_tokens"),
        top_p=updated_settings.get("top_p"),
        stop_sequences=updated_settings.get("stop_sequences"),
        chunk_size=updated_settings.get("chunk_size"),
        chunk_overlap=updated_settings.get("chunk_overlap"),
        updated_at=updated_settings.get("updated_at").isoformat()
    )

@router.get("/models")
async def get_supported_models():
    """Get list of supported models for dropdown"""
    return {
        "openai": SUPPORTED_MODELS.get("openai", []),
        "gemini": SUPPORTED_MODELS.get("gemini", [])
    }

@router.delete("")
async def remove_settings(user_id: str = Depends(get_current_user_id)):
    """Delete user settings"""
    deleted = await delete_user_settings(user_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Settings not found")
    
    return {"message": "Settings deleted successfully"}