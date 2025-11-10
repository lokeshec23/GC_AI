# backend/settings/models.py

from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, DB_NAME
from datetime import datetime
from typing import Optional, Dict

# Initialize MongoDB client and select database
settings_collection = None # Initialize as None
try:
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    settings_collection = db["settings"]
    print("✅ MongoDB connection for settings successful.")
except Exception as e:
    print(f"❌ MongoDB connection for settings failed: {e}")
    # In a real production app, you might want to exit or handle this more gracefully

async def get_user_settings(user_id: str) -> Optional[Dict]:
    """
    Retrieves settings for a specific user from the database.
    """
    # ✅ CORRECTED: Compare with None
    if settings_collection is None:
        raise ConnectionError("Database connection is not available.")
    return await settings_collection.find_one({"user_id": user_id})

async def create_or_update_settings(user_id: str, settings_data: Dict) -> Optional[Dict]:
    """
    Creates new settings for a user or updates existing ones.
    """
    # ✅ CORRECTED: Compare with None
    if settings_collection is None:
        raise ConnectionError("Database connection is not available.")

    # Prepare the update payload
    update_payload = {
        "$set": settings_data,
        "$currentDate": {"updated_at": True},
        "$setOnInsert": {"user_id": user_id, "created_at": datetime.utcnow()}
    }

    # Perform the upsert operation
    await settings_collection.update_one(
        {"user_id": user_id},
        update_payload,
        upsert=True
    )
    
    # Return the updated document
    return await get_user_settings(user_id)

async def delete_user_settings(user_id: str) -> bool:
    """
    Deletes all settings for a specific user.
    """
    # ✅ CORRECTED: Compare with None
    if settings_collection is None:
        raise ConnectionError("Database connection is not available.")
        
    result = await settings_collection.delete_one({"user_id": user_id})
    return result.deleted_count > 0