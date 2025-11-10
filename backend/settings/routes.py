# backend/settings/routes.py

from fastapi import APIRouter, HTTPException, Header, Depends
from settings.models import get_user_settings, create_or_update_settings, delete_user_settings
from settings.schemas import SettingsUpdate, SettingsResponse
from auth.utils import verify_token
from config import SUPPORTED_MODELS, DEFAULT_PAGES_PER_CHUNK
from datetime import datetime

router = APIRouter(prefix="/settings", tags=["Settings"])

async def get_current_user_id(authorization: str = Header(...)) -> str:
    """Dependency to extract user ID from a JWT token in the header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = authorization.split(" ")[1]
    payload = verify_token(token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token does not contain a user ID")
        
    return user_id

@router.get("", response_model=SettingsResponse)
async def get_settings_route(user_id: str = Depends(get_current_user_id)):
    """API endpoint to get the current user's settings."""
    settings = await get_user_settings(user_id)
    
    if not settings:
        raise HTTPException(
            status_code=404,
            detail="Settings not found. Please save your settings first."
        )
    
    # ✅ CORRECTED: Convert datetime to ISO string before validation
    if 'updated_at' in settings and isinstance(settings['updated_at'], datetime):
        settings['updated_at'] = settings['updated_at'].isoformat()
    
    # Ensure a default value for pages_per_chunk if it's missing
    if "pages_per_chunk" not in settings:
        settings["pages_per_chunk"] = DEFAULT_PAGES_PER_CHUNK
    
    # Use model_validate which is the modern Pydantic v2 way
    return SettingsResponse.model_validate(settings)

@router.post("", response_model=SettingsResponse)
async def update_settings_route(
    settings_data: SettingsUpdate,
    user_id: str = Depends(get_current_user_id)
):
    """API endpoint to create or update user settings."""
    # `exclude_unset=True` ensures we only update fields the user actually sent
    settings_dict = settings_data.model_dump(exclude_unset=True)
    
    updated_settings = await create_or_update_settings(user_id, settings_dict)
    
    if not updated_settings:
        raise HTTPException(status_code=500, detail="Failed to save settings to the database.")

    # ✅ CORRECTED: Convert datetime to ISO string before validation
    if 'updated_at' in updated_settings and isinstance(updated_settings['updated_at'], datetime):
        updated_settings['updated_at'] = updated_settings['updated_at'].isoformat()

    return SettingsResponse.model_validate(updated_settings)

@router.get("/models")
async def get_supported_models_route():
    """API endpoint to get the list of supported models for UI dropdowns."""
    return SUPPORTED_MODELS

@router.delete("")
async def remove_settings_route(user_id: str = Depends(get_current_user_id)):
    """API endpoint to delete a user's settings."""
    deleted = await delete_user_settings(user_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="No settings found to delete.")
    
    return {"message": "Settings deleted successfully"}