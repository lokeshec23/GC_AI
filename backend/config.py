# config.py
import os
from datetime import timedelta

# MongoDB
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "GC_AI_DB")

# JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecretkey")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Azure OCR (from your old .env)
AZURE_DI_ENDPOINT = os.getenv("DI_endpoint")
AZURE_DI_KEY = os.getenv("DI_key")

# Supported Models
SUPPORTED_MODELS = {
    "openai": [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo"
    ],
    "gemini": [
        "gemini-2.5-pro",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp"
    ]
}

# Gemini API Configuration
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Default Settings
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 4096
DEFAULT_TOP_P = 1.0
DEFAULT_CHUNK_SIZE = 7000
DEFAULT_CHUNK_OVERLAP = 200