# settings/schemas.py
from pydantic import BaseModel, Field
from typing import Optional, List
from config import (
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TOP_P,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_CHUNK_OVERLAP
)

class SettingsUpdate(BaseModel):
    # API Keys (plain text as requested)
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    
    # LLM Parameters
    temperature: float = Field(default=DEFAULT_TEMPERATURE, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=DEFAULT_MAX_TOKENS, ge=1, le=128000)
    top_p: float = Field(default=DEFAULT_TOP_P, ge=0.0, le=1.0)
    stop_sequences: List[str] = Field(default_factory=list)
    
    # Chunking Parameters
    chunk_size: int = Field(default=DEFAULT_CHUNK_SIZE, ge=1000, le=100000)
    chunk_overlap: int = Field(default=DEFAULT_CHUNK_OVERLAP, ge=0, le=1000)

class SettingsResponse(BaseModel):
    user_id: str
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    temperature: float
    max_output_tokens: int
    top_p: float
    stop_sequences: List[str]
    chunk_size: int
    chunk_overlap: int
    updated_at: str

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "507f1f77bcf86cd799439011",
                "openai_api_key": "sk-...",
                "gemini_api_key": "AIza...",
                "temperature": 0.7,
                "max_output_tokens": 4096,
                "top_p": 1.0,
                "stop_sequences": [],
                "chunk_size": 7000,
                "chunk_overlap": 200,
                "updated_at": "2024-01-15T10:30:00"
            }
        }