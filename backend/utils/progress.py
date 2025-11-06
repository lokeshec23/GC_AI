# utils/progress.py
import threading
from typing import Dict

# Store progress for each session
progress_store: Dict[str, dict] = {}
progress_lock = threading.Lock()

def update_progress(session_id: str, progress: int, message: str):
    """Update progress for a specific session (thread-safe)"""
    with progress_lock:
        progress_store[session_id] = {
            "progress": min(progress, 100),
            "message": message,
        }
        print(f"📊 [{session_id[:8]}] {progress}% - {message}")

def get_progress(session_id: str) -> dict:
    """Get current progress for a session"""
    with progress_lock:
        return progress_store.get(session_id, {"progress": 0, "message": "Not found"})

def delete_progress(session_id: str):
    """Remove progress data for a session"""
    with progress_lock:
        if session_id in progress_store:
            del progress_store[session_id]