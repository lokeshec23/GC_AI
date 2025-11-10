# backend/compare/schemas.py

from pydantic import BaseModel
from typing import Optional

class CompareResponse(BaseModel):
    """
    Defines the initial response sent back to the frontend
    after a comparison job has started.
    """
    status: str
    message: str
    session_id: str

class ComparisonStatus(BaseModel):
    """
    Defines the structure for checking the status of a running comparison job.
    """
    status: str
    progress: int
    message: str
    result_url: Optional[str] = None