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

# Azure OCR
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

# ✅ Model Token Limits Configuration
MODEL_TOKEN_LIMITS = {
    # OpenAI Models
    "gpt-4o": {
        "max_input": 128000,
        "max_output": 16384,
        "recommended_chunk": 4000,  # Conservative for prompt + context
    },
    "gpt-4-turbo": {
        "max_input": 128000,
        "max_output": 4096,
        "recommended_chunk": 3000,
    },
    "gpt-4": {
        "max_input": 8192,
        "max_output": 4096,
        "recommended_chunk": 2000,
    },
    "gpt-3.5-turbo": {
        "max_input": 16385,
        "max_output": 4096,
        "recommended_chunk": 3000,
    },
    
    # Gemini Models - Account for thinking tokens
    "gemini-2.5-pro": {
        "max_input": 1000000,  # Very large context
        "max_output": 32768,
        "recommended_chunk": 8000,
        "thinking_tokens_overhead": 4000,  # Reserve for thinking
    },
    "gemini-2.5-flash-preview-05-20": {
        "max_input": 1000000,
        "max_output": 8192,
        "recommended_chunk": 1500,  # Small chunks due to thinking tokens
        "thinking_tokens_overhead": 4000,
    },
    "gemini-2.5-flash-lite": {
        "max_input": 1000000,
        "max_output": 8192,
        "recommended_chunk": 1500,
        "thinking_tokens_overhead": 4000,
    },
    "gemini-2.0-flash": {
        "max_input": 1000000,
        "max_output": 8192,
        "recommended_chunk": 1500,
        "thinking_tokens_overhead": 4000,
    },
    "gemini-2.0-flash-exp": {
        "max_input": 1000000,
        "max_output": 8192,
        "recommended_chunk": 1500,
        "thinking_tokens_overhead": 4000,
    },
}

# Gemini API Configuration
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Default Settings
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 8192
DEFAULT_TOP_P = 1.0
DEFAULT_CHUNK_SIZE = 3000  # Will be overridden by model-specific settings
DEFAULT_CHUNK_OVERLAP = 200


def get_model_config(model_name: str) -> dict:
    """Get token configuration for a specific model"""
    return MODEL_TOKEN_LIMITS.get(model_name, {
        "max_input": 8192,
        "max_output": 4096,
        "recommended_chunk": 2000,
        "thinking_tokens_overhead": 0,
    })