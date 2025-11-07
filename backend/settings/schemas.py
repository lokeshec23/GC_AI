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
    # Azure OpenAI
    openai_api_key: Optional[str] = None
    openai_endpoint: Optional[str] = None
    openai_deployment: Optional[str] = None
    
    # Gemini
    gemini_api_key: Optional[str] = None
    
    # LLM Parameters
    temperature: float = Field(default=DEFAULT_TEMPERATURE, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=DEFAULT_MAX_TOKENS, ge=1, le=128000)
    top_p: float = Field(default=DEFAULT_TOP_P, ge=0.0, le=1.0)
    stop_sequences: List[str] = Field(default_factory=list)
    
    # Chunking Parameters
    chunk_size: int = Field(default=DEFAULT_CHUNK_SIZE, ge=500, le=10000)
    chunk_overlap: int = Field(default=DEFAULT_CHUNK_OVERLAP, ge=0, le=500)

class SettingsResponse(BaseModel):
    user_id: str
    openai_api_key: Optional[str] = None
    openai_endpoint: Optional[str] = None
    openai_deployment: Optional[str] = None
    gemini_api_key: Optional[str] = None
    temperature: float
    max_output_tokens: int
    top_p: float
    stop_sequences: List[str]
    chunk_size: int
    chunk_overlap: int
    updated_at: str