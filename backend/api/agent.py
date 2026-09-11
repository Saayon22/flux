"""FastAPI Router for Google ADK Agent endpoints in flux.

Handles:
- POST /api/repos/{owner}/{repo}/issues/{issue_number}/handoff:
    Executes end-to-end Phase 6 & Phase 7 agent handoff with Human-in-the-Loop opt-in,
    lazy forking, autonomous code patch generation, Complexity Router evaluation,
    and cross-repo PR or Plan Artifact creation.
- POST /api/agent/chat:
    Interactive conversational session with the multi-agent system.
- GET /api/agent/status:
    Health and capability discovery endpoint.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from config import settings
from models.database import (
    get_repository_by_id,
    get_issues_by_repo_id,
    get_issue_explanation,
    save_handoff_result,
    get_handoff_result,
    delete_handoff_result,
)
from agent.runner import (
    AgentRunner,
    run_agent_handoff,
    confirm_and_publish_pr,
    rollback_agent_handoff,
)
from agent.config import DEFAULT_CHEAP_MODEL, DEFAULT_STRONGEST_MODEL

router = APIRouter(tags=["agent"])


class HandoffRequest(BaseModel):
    opt_in: bool = Field(True, description="Human-in-the-Loop confirmation to authorize agent handoff")
    user_notes: Optional[str] = Field(None, description="Optional developer instructions or constraints for the agent")
    auto_publish_pr: bool = Field(False, description="Automatically publish PR without pausing for developer review")


class PublishPRRequest(BaseModel):
    diff: Optional[str] = Field(None, description="Unified patch diff to publish")
    fork_ref: Optional[str] = Field(None, description="Fork reference to push branch to")


class ChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = "flux_user"


class ChatResponse(BaseModel):
    status: str
    session_id: str
    response: str


@router.get("/api/agent/status")
async def get_agent_status():
    """Returns Google ADK agent system status, model configuration, GitHub rate limit, and capabilities."""
    has_api_key = bool(settings.effective_api_key)

    github_info = {
        "authenticated": False,
        "user": None,
        "limit": 60,
        "remaining": 60,
        "reset": None,
    }
    github_token = settings.github_token or os.getenv("GITHUB_TOKEN", "")
    if github_token:
        try:
            import requests
            headers = {
                "Authorization": f"Bearer {github_token}",
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "flux-Agent",
            }
            rl_resp = requests.get("https://api.github.com/rate_limit", headers=headers, timeout=5)
            if rl_resp.status_code == 200:
                core = rl_resp.json().get("resources", {}).get("core", {})
                github_info["authenticated"] = True
                github_info["limit"] = core.get("limit", 5000)
                github_info["remaining"] = core.get("remaining", 5000)
                github_info["reset"] = core.get("reset")

            u_resp = requests.get("https://api.github.com/user", headers=headers, timeout=5)
            if u_resp.status_code == 200:
                github_info["user"] = u_resp.json().get("login")
        except Exception:
            pass

    return {
        "status": "online" if has_api_key else "degraded",
        "agent": "flux_root",
        "framework": "Google ADK (google-adk)",
        "sdk": "Google GenAI (google-genai)",
        "model": settings.effective_model,
        "models": {
            "cheap": DEFAULT_CHEAP_MODEL,
            "strong": DEFAULT_STRONGEST_MODEL,
        },
        "has_api_key": has_api_key,
        "github": github_info,
        "capabilities": [
            "Human-in-the-Loop Opt-In Gate",
            "AST & Dependency Graph Digest Synthesis",
            "Grounded Issue Triage (1-hop neighborhood)",
            "Lazy Fork Provisioning (LongRunningFunctionTool)",
            "Autonomous Code Synthesis (Google ADK & Gemini)",
            "Deterministic Complexity Routing (PR vs Plan Artifact)",
            "Cross-Repo PR Publication",
            "Implementation Plan Artifact Persistence & Download",
        ],
    }


@router.post("/api/agent/chat", response_model=ChatResponse)
async def chat_with_agent(req: ChatRequest):
    """Sends a prompt or query to the Google ADK multi-agent assistant."""
    msg = req.message or req.prompt
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing 'message' or 'prompt' in request body."
        )

    res = await AgentRunner.run_turn(
        message=msg,
        session_id=req.session_id,
        user_id=req.user_id or "flux_user",
    )

    return ChatResponse(
        status=res.get("status", "success"),
        session_id=res.get("session_id", ""),
        response=res.get("response", ""),
    )


@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/handoff")
async def execute_issue_handoff(
    owner: str,
    repo: str,
    issue_number: int,
    req: HandoffRequest,
):
    """Executes the high-stakes Phase 6 & 7 agent handoff workflow for a specific GitHub issue."""
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)

    # 1. Human-in-the-Loop Opt-In Check
    if not req.opt_in:
        return {
            "status": "declined",
            "authorized": False,
            "message": "User declined handoff. No forks or code modifications will occur.",
        }

    # 2. Retrieve issue data from SQLite or construct placeholder
    issues_list = get_issues_by_repo_id(repo_id) if repo_record else []
    target_issue = next((i for i in issues_list if i["issue_number"] == issue_number), None)
    if not target_issue:
        target_issue = {
            "title": f"Resolve issue #{issue_number} in {owner}/{repo}",
            "body": "Automated resolution request for repository issue.",
            "state": "open",
        }

    # 3. Retrieve relevant files and estimated complexity from cached explanation if present
    relevant_files: List[str] = []
    estimated_complexity: Optional[str] = None
    explanation_record = get_issue_explanation(repo_id, issue_number)
    if explanation_record:
        import json
        try:
            rfs = json.loads(explanation_record.get("relevant_files_json", "[]"))
            relevant_files = [f["file"] for f in rfs if "file" in f]
        except Exception:
            pass
        estimated_complexity = explanation_record.get("estimated_complexity")

    # 4. Resolve local directory path
    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

    # 5. Execute handoff pipeline
    result = await run_agent_handoff(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        issue_data=target_issue,
        relevant_files=relevant_files,
        opt_in=req.opt_in,
        repo_path=repo_path,
        estimated_complexity=estimated_complexity,
        auto_publish_pr=req.auto_publish_pr,
    )

    # 6. Persist handoff result (PR or Plan Artifact) to SQLite
    if result.get("status") == "success":
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            save_handoff_result(repo_id, issue_number, result, now_iso)
        except Exception as e:
            # Non-blocking log
            pass

    return result


@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/publish-pr")
async def publish_issue_pull_request(
    owner: str,
    repo: str,
    issue_number: int,
    req: Optional[PublishPRRequest] = None,
):
    """Publishes a verified code patch as a GitHub Pull Request after developer review."""
    repo_id = f"{owner.lower()}/{repo.lower()}"
    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

    # Retrieve existing handoff record to obtain synthesized diff and fork if not in request
    existing_record = get_handoff_result(repo_id, issue_number)
    diff = (req.diff if req and req.diff else None) or (existing_record.get("diff") if existing_record else "")
    fork_info = (existing_record.get("fork") if existing_record else {}) or {}
    fork_ref = (req.fork_ref if req and req.fork_ref else None) or fork_info.get("fork_ref", f"flux-bot/{repo}")

    if not diff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No synthesized diff found to publish as Pull Request."
        )

    publish_res = confirm_and_publish_pr(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        diff=diff,
        fork_ref=fork_ref,
        repo_path=repo_path,
    )

    # Update SQLite record
    if existing_record:
        existing_record["pr"] = publish_res.get("pr")
        existing_record["message"] = publish_res.get("message", "")
        now_iso = datetime.now(timezone.utc).isoformat()
        save_handoff_result(repo_id, issue_number, existing_record, now_iso)

    return publish_res


@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/rollback")
async def rollback_issue_handoff(owner: str, repo: str, issue_number: int):
    """Discards local workspace changes and temporary branches for an issue handoff."""
    repo_id = f"{owner.lower()}/{repo.lower()}"
    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

    res = rollback_agent_handoff(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        repo_path=repo_path,
    )

    # Delete cached handoff status in SQLite to allow fresh re-runs
    delete_handoff_result(repo_id, issue_number)

    return res


@router.get("/api/repos/{owner}/{repo}/issues/{issue_number}/handoff")
async def get_issue_handoff_status(owner: str, repo: str, issue_number: int):
    """Retrieves cached agent handoff results (PR or Plan Artifact) for an issue."""
    repo_id = f"{owner.lower()}/{repo.lower()}"
    record = get_handoff_result(repo_id, issue_number)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No agent handoff record found for issue #{issue_number} in {owner}/{repo}."
        )
    return record

