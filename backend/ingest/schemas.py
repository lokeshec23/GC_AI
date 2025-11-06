# ingest/schemas.py
from pydantic import BaseModel, Field
from typing import Optional

class IngestRequest(BaseModel):
    """Request model for ingesting a guideline"""
    model_provider: str = Field(..., description="'openai' or 'gemini'")
    model_name: str = Field(..., description="Model to use (e.g., 'gpt-4o', 'gemini-1.5-pro')")
    custom_prompt: str = Field(..., description="User's custom extraction prompt")
    
    class Config:
        json_schema_extra = {
            "example": {
                "model_provider": "openai",
                "model_name": "gpt-4o",
                "custom_prompt": "Extract all eligibility rules and conditions from this mortgage guideline. Output JSON format with section names as keys."
            }
        }

class IngestResponse(BaseModel):
    """Response after starting ingestion"""
    status: str
    message: str
    session_id: str

class ProcessingStatus(BaseModel):
    """Status of a processing job"""
    status: str  # "processing", "completed", "failed"
    progress: int
    message: str
    result_url: Optional[str] = None