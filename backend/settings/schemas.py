# settings/schemas.py
from pydantic import BaseModel, Field
from typing import Optional, List
from config import (
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    DEFAULT_TOP_P
)

# ✅ NEW: Default for page-based chunking
DEFAULT_PAGES_PER_CHUNK = 1

class SettingsUpdate(BaseModel):
    # OpenAI (Azure)
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
    
    # ✅ CHANGED: PDF Chunking Parameters
    pages_per_chunk: int = Field(default=DEFAULT_PAGES_PER_CHUNK, ge=1, le=50)

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
    pages_per_chunk: int # ✅ CHANGED
    updated_at: str