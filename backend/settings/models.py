# settings/models.py
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, DB_NAME
from datetime import datetime
from bson import ObjectId
from typing import Optional

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]

settings_collection = db["settings"]

async def get_user_settings(user_id: str) -> Optional[dict]:
    """Get settings for a specific user"""
    return await settings_collection.find_one({"user_id": user_id})

async def create_or_update_settings(user_id: str, settings_data: dict) -> dict:
    """Create or update user settings"""
    settings_data["user_id"] = user_id
    settings_data["updated_at"] = datetime.utcnow()
    
    existing = await get_user_settings(user_id)
    
    if existing:
        # Update existing
        await settings_collection.update_one(
            {"user_id": user_id},
            {"$set": settings_data}
        )
        return await get_user_settings(user_id)
    else:
        # Create new
        settings_data["created_at"] = datetime.utcnow()
        result = await settings_collection.insert_one(settings_data)
        return await settings_collection.find_one({"_id": result.inserted_id})

async def delete_user_settings(user_id: str) -> bool:
    """Delete user settings"""
    result = await settings_collection.delete_one({"user_id": user_id})
    return result.deleted_count > 0