# backend/settings/schemas.py

from pydantic import BaseModel, Field
from typing import Optional, List
from config import (
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TOP_P,
    DEFAULT_PAGES_PER_CHUNK
)

class SettingsUpdate(BaseModel):
    """
    Pydantic model for updating user settings.
    This structure is received from the frontend.
    """
    # --- Provider Credentials ---
    openai_api_key: Optional[str] = None
    openai_endpoint: Optional[str] = None
    openai_deployment: Optional[str] = None
    gemini_api_key: Optional[str] = None
    
    # --- LLM Generation Parameters ---
    temperature: float = Field(default=DEFAULT_TEMPERATURE, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=DEFAULT_MAX_TOKENS, ge=1, le=128000)
    top_p: float = Field(default=DEFAULT_TOP_P, ge=0.0, le=1.0)
    stop_sequences: List[str] = Field(default_factory=list)
    
    # --- PDF Chunking Strategy ---
    pages_per_chunk: int = Field(default=DEFAULT_PAGES_PER_CHUNK, ge=1, le=50)

class SettingsResponse(BaseModel):
    """
    Pydantic model for returning user settings.
    This structure is sent back to the frontend.
    """
    user_id: str
    
    # --- Provider Credentials (optional, as they might not be set) ---
    openai_api_key: Optional[str] = None
    openai_endpoint: Optional[str] = None
    openai_deployment: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # --- LLM & Chunking Parameters ---
    temperature: float
    max_output_tokens: int
    top_p: float
    stop_sequences: List[str]
    pages_per_chunk: int
    
    # --- Metadata ---
    updated_at: str

    class Config:
        """Pydantic model configuration."""
        from_attributes = True # Allows creating this model from ORM objects