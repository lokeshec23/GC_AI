# backend/config.py

import os
from datetime import timedelta
from typing import Dict

# --- MongoDB Configuration ---
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME: str = os.getenv("DB_NAME", "GC_AI_DB")

# --- JWT Authentication ---
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "a-very-secret-key-that-should-be-changed")
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
REFRESH_TOKEN_EXPIRE_DAYS: int = 7

# --- Azure Services ---
# For Document Intelligence (OCR)
AZURE_DI_ENDPOINT: str = os.getenv("DI_endpoint")
AZURE_DI_KEY: str = os.getenv("DI_key")

# --- LLM Provider Configuration ---

SUPPORTED_MODELS: Dict[str, list] = {
    "openai": [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo"
    ],
    "gemini": [
        "gemini-1.5-pro-latest",
        "gemini-1.5-flash-latest",
        "gemini-1.0-pro"
    ]
}

MODEL_TOKEN_LIMITS: Dict[str, dict] = {
    # OpenAI Models
    "gpt-4o": {"max_input": 128000, "max_output": 16384, "recommended_chunk": 6000},
    "gpt-4-turbo": {"max_input": 128000, "max_output": 4096, "recommended_chunk": 5000},
    "gpt-4": {"max_input": 8192, "max_output": 4096, "recommended_chunk": 2000},
    "gpt-3.5-turbo": {"max_input": 16385, "max_output": 4096, "recommended_chunk": 3000},
    
    # Gemini Models
    "gemini-1.5-pro-latest": {"max_input": 1000000, "max_output": 8192, "recommended_chunk": 8000},
    "gemini-1.5-flash-latest": {"max_input": 1000000, "max_output": 8192, "recommended_chunk": 4000},
    "gemini-1.0-pro": {"max_input": 30720, "max_output": 2048, "recommended_chunk": 2000},
}

GEMINI_API_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/models"

# --- Default Application Settings ---

DEFAULT_TEMPERATURE: float = 0.5
DEFAULT_MAX_TOKENS: int = 8192
DEFAULT_TOP_P: float = 1.0
DEFAULT_PAGES_PER_CHUNK: int = 1

# --- Helper Function ---

def get_model_config(model_name: str) -> dict:
    """
    Retrieves token configuration for a given model.
    Falls back to a safe default if the model is not found.
    """
    return MODEL_TOKEN_LIMITS.get(model_name, {
        "max_input": 8192,
        "max_output": 2048,
        "recommended_chunk": 1500,
    })