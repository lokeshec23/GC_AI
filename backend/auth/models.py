# backend/auth/models.py

from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, DB_NAME

# Initialize as None
users_collection = None
try:
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    users_collection = db["users"]
    print("✅ MongoDB connection for auth successful.")
except Exception as e:
    print(f"❌ MongoDB connection for auth failed: {e}")

async def find_user_by_email(email: str):
    # ✅ CORRECTED
    if users_collection is None:
        raise ConnectionError("Database connection is not available.")
    return await users_collection.find_one({"email": email})

async def create_user(user_data: dict):
    # ✅ CORRECTED
    if users_collection is None:
        raise ConnectionError("Database connection is not available.")
    result = await users_collection.insert_one(user_data)
    return await users_collection.find_one({"_id": result.inserted_id})