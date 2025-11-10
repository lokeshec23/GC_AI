# backend/ingest/schemas.py

from pydantic import BaseModel
from typing import Optional

class IngestRequest(BaseModel):
    """
    Defines the expected data for an ingestion request.
    This is sent from the frontend as form data.
    """
    model_provider: str
    model_name: str
    custom_prompt: str

class IngestResponse(BaseModel):
    """
    Defines the initial response sent back to the frontend
    after an ingestion job has started.
    """
    status: str
    message: str
    session_id: str

class ProcessingStatus(BaseModel):
    """
    Defines the structure for checking the status of a running job.
    """
    status: str  # e.g., "processing", "completed", "failed"
    progress: int
    message: str
    result_url: Optional[str] = None