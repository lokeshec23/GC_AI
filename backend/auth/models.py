# auth/models.py
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, DB_NAME

# Initialize Mongo client
client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]

# Access users collection
users_collection = db["users"]

# Helper function to find user by email
async def find_user_by_email(email: str):
    return await users_collection.find_one({"email": email})

# Helper function to create user
async def create_user(user_data: dict):
    result = await users_collection.insert_one(user_data)
    return await users_collection.find_one({"_id": result.inserted_id})