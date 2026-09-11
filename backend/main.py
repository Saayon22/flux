"""
Main entry point for flux FastAPI backend application.
Configures CORS middleware, database lifecycle, and API routing.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models.database import init_db
from api.repos import router as repos_router
from api.graph import router as graph_router
from api.understanding import router as understanding_router
from api.files import router as files_router
from api.issues import router as issues_router
from api.agent import router as agent_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Initializes SQLite database schemas on startup.
    """
    init_db()
    yield


app = FastAPI(
    title="flux API",
    description="Backend service for grounded repository analysis, AST dependency graphing, and agent handoff.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for Next.js frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(repos_router)
app.include_router(graph_router)
app.include_router(understanding_router)
app.include_router(files_router)
app.include_router(issues_router)
app.include_router(agent_router)


@app.get("/api/health", tags=["system"])
async def health_check():
    """
    Health check endpoint returning system status and current phase indicator.
    """
    return {
        "status": "healthy",
        "app": "flux",
        "phase": "Phase 1 - Repository Ingestion",
    }
