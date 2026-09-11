"""Web Client Interactive Backend Server for RepoRamp ADK Agent.

Usage:
    python server.py

Provides a pure backend REST interactive session (no frontend UI).
Send POST requests to /chat with JSON:
    {"message": "Explain the repository structure"}
"""

import sys
import uuid
from typing import Any, Dict, Optional

import warnings
warnings.filterwarnings("ignore")

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from agent import root_agent
from tracing import logger

app = FastAPI(
    title="RepoRamp Backend Interactive Agent",
    description="REST backend for interacting with RepoRamp Google ADK Agent.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = InMemorySessionService()
runner = Runner(
    app_name="reporamp",
    agent=root_agent,
    session_service=session_service,
    auto_create_session=True,
)

# In-memory session tracking
active_sessions: Dict[str, str] = {}


class ChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = "web_client"


class ChatResponse(BaseModel):
    status: str
    session_id: str
    response: str


@app.get("/")
def root():
    return {
        "status": "online",
        "agent": "reporamp_root",
        "description": "RepoRamp Backend Interactive Agent (No frontend UI)",
        "endpoints": {
            "chat": "POST /chat - Send prompt and receive agent response",
            "docs": "GET /docs - OpenAPI Interactive Swagger Documentation",
        },
    }


@app.get("/status")
def status():
    return {"status": "healthy", "service": "reporamp-agent-backend"}


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    text = req.message or req.prompt
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'message' or 'prompt' in request body.")

    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:8]}"
    user_id = req.user_id or "web_client"

    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=text)],
    )

    response_chunks = []
    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if getattr(part, "text", None):
                        response_chunks.append(part.text)
            elif event.output:
                response_chunks.append(str(event.output))

        final_response = "".join(response_chunks).strip() if response_chunks else "Task completed."
        return ChatResponse(status="success", session_id=session_id, response=final_response)

    except Exception as e:
        logger.warning("Error in /chat endpoint: %s", e)
        err_msg = str(e)
        if "DNS" in err_msg or "Cannot connect" in err_msg or "ClientConnector" in err_msg:
            fallback_text = (
                f"[Network Notice: Remote model endpoint temporarily unreachable]\n"
                f"Local tools are ready. Received request: '{text}'"
            )
            return ChatResponse(status="fallback", session_id=session_id, response=fallback_text)
        return ChatResponse(status="error", session_id=session_id, response=f"Agent error: {err_msg}")


def main():
    print("=" * 70)
    print("  REPORAMP — BACKEND INTERACTIVE SERVER")
    print("  Listening on http://127.0.0.1:8000")
    print("  Send POST requests to: http://127.0.0.1:8000/chat")
    print("=" * 70)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
