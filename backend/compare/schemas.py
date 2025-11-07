# compare/schemas.py
from pydantic import BaseModel
from typing import Optional

class CompareRequest(BaseModel):
    """Request model for comparing guidelines"""
    model_provider: str
    model_name: str
    custom_prompt: str

class CompareResponse(BaseModel):
    """Response after starting comparison"""
    status: str
    message: str
    session_id: str

class ComparisonStatus(BaseModel):
    """Status of a comparison job"""
    status: str  # "processing", "completed", "failed"
    progress: int
    message: str
    result_url: Optional[str] = None