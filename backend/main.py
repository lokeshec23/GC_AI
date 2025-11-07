# main.py
import os
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Disable SSL warnings
os.environ.pop("REQUESTS_CA_BUNDLE", None)
os.environ["AZURE_CLI_DISABLE_CONNECTION_VERIFICATION"] = "1"

# Import routers
from auth.routes import router as auth_router
from settings.routes import router as settings_router
from ingest.routes import router as ingest_router
from compare.routes import router as compare_router  # ✅ NEW

# Initialize FastAPI
app = FastAPI(
    title="Guideline Extraction & Comparison System",
    description="Extract and compare mortgage guidelines using custom prompts",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(ingest_router)
app.include_router(compare_router)  # ✅ NEW

# Health check
@app.get("/")
def root():
    return {
        "message": "✅ Guideline Extraction & Comparison System API",
        "version": "2.0.0",
        "endpoints": {
            "auth": "/auth",
            "settings": "/settings",
            "ingest": "/ingest",
            "compare": "/compare",  # ✅ NEW
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)