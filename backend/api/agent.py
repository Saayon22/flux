# FastAPI Router for Google ADK Agent conversational and automated handoff endpoints.

import os
from datetime import datetime, timezone
from typing import Optional
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


# Request schema for authorizing agent handoff.
class HandoffRequest(BaseModel):
    opt_in: bool = Field(True, description="Human-in-the-Loop confirmation")
    user_notes: Optional[str] = Field(None, description="Developer notes")
    auto_publish_pr: bool = Field(False, description="Automatically publish PR")


# Request schema for confirming Pull Request publication.
class PublishPRRequest(BaseModel):
    diff: Optional[str] = Field(None, description="Unified patch diff")
    fork_ref: Optional[str] = Field(None, description="Fork reference")


# Request schema for conversational agent turns.
class ChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = "flux_user"


# Response schema for conversational agent turns.
class ChatResponse(BaseModel):
    status: str
    session_id: str
    response: str


# Returns agent system status, model configuration, GitHub rate limits, and capabilities.
@router.get("/api/agent/status")
async def get_agent_status():
    has_api_key = bool(settings.effective_api_key)
    github_info = {"authenticated": False, "user": None, "limit": 60, "remaining": 60, "reset": None}
    github_token = settings.github_token or os.getenv("GITHUB_TOKEN", "")

    if github_token:
        try:
            import requests
            headers = {"Authorization": f"Bearer {github_token}", "Accept": "application/vnd.github.v3+json", "User-Agent": settings.user_agent}
            rl_resp = requests.get(f"{settings.github_api_url}/rate_limit", headers=headers, timeout=max(settings.http_timeout / 2, 5.0))
            if rl_resp.status_code == 200:
                core = rl_resp.json().get("resources", {}).get("core", {})
                github_info["authenticated"] = True
                github_info["limit"] = core.get("limit", 5000)
                github_info["remaining"] = core.get("remaining", 5000)
                github_info["reset"] = core.get("reset")

            u_resp = requests.get(f"{settings.github_api_url}/user", headers=headers, timeout=max(settings.http_timeout / 2, 5.0))
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
        "models": {"cheap": DEFAULT_CHEAP_MODEL, "strong": DEFAULT_STRONGEST_MODEL},
        "has_api_key": has_api_key,
        "github": github_info,
        "capabilities": [
            "Human-in-the-Loop Opt-In Gate",
            "AST & Dependency Graph Digest Synthesis",
            "Grounded Issue Triage (1-hop neighborhood)",
            "Lazy Fork Provisioning",
            "Autonomous Code Synthesis",
            "Deterministic Complexity Routing (PR vs Plan Artifact)",
            "Cross-Repo PR Publication",
            "Implementation Plan Artifact Persistence",
        ],
    }


# Sends a message to the Google ADK interactive multi-agent chat assistant.
@router.post("/api/agent/chat", response_model=ChatResponse)
async def chat_with_agent(req: ChatRequest):
    msg = req.message or req.prompt
    if not msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing 'message' in request body.")

    res = await AgentRunner.run_turn(message=msg, session_id=req.session_id, user_id=req.user_id or "flux_user")
    return ChatResponse(status=res.get("status", "success"), session_id=res.get("session_id", ""), response=res.get("response", ""))


# Executes the agent handoff workflow for a specific GitHub issue.
@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/handoff")
async def execute_issue_handoff(owner: str, repo: str, issue_number: int, req: HandoffRequest):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)

    if not req.opt_in:
        return {"status": "declined", "authorized": False, "message": "User declined handoff."}

    issues_list = get_issues_by_repo_id(repo_id) if repo_record else []
    target_issue = next((i for i in issues_list if i["issue_number"] == issue_number), None)
    if not target_issue:
        target_issue = {"title": f"Resolve issue #{issue_number}", "body": "Automated resolution request.", "state": "open"}

    relevant_files = []
    estimated_complexity = None
    explanation_record = get_issue_explanation(repo_id, issue_number)
    if explanation_record:
        import json
        try:
            rfs = json.loads(explanation_record.get("relevant_files_json", "[]"))
            relevant_files = [f["file"] for f in rfs if "file" in f]
        except Exception:
            pass
        estimated_complexity = explanation_record.get("estimated_complexity")

    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

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

    if result.get("status") == "success":
        try:
            save_handoff_result(repo_id, issue_number, result, datetime.now(timezone.utc).isoformat())
        except Exception:
            pass

    return result


# Publishes a verified code patch as a GitHub Pull Request after developer review.
@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/publish-pr")
async def publish_issue_pull_request(owner: str, repo: str, issue_number: int, req: Optional[PublishPRRequest] = None):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

    existing_record = get_handoff_result(repo_id, issue_number)
    diff = (req.diff if req and req.diff else None) or (existing_record.get("diff") if existing_record else "")
    fork_info = (existing_record.get("fork") if existing_record else {}) or {}
    fork_ref = (req.fork_ref if req and req.fork_ref else None) or fork_info.get("fork_ref", f"flux-bot/{repo}")

    if not diff:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No synthesized diff found to publish.")

    publish_res = confirm_and_publish_pr(
        owner=owner, repo=repo, issue_number=issue_number, diff=diff, fork_ref=fork_ref, repo_path=repo_path
    )

    if existing_record:
        existing_record["pr"] = publish_res.get("pr")
        existing_record["message"] = publish_res.get("message", "")
        save_handoff_result(repo_id, issue_number, existing_record, datetime.now(timezone.utc).isoformat())

    return publish_res


# Discards local workspace changes and temporary fix branch.
@router.post("/api/repos/{owner}/{repo}/issues/{issue_number}/rollback")
async def rollback_issue_handoff(owner: str, repo: str, issue_number: int):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    local_dir = settings.workspaces_dir / owner / repo
    repo_path = str(local_dir) if local_dir.exists() else None

    res = rollback_agent_handoff(owner=owner, repo=repo, issue_number=issue_number, repo_path=repo_path)
    delete_handoff_result(repo_id, issue_number)
    return res


# Retrieves cached agent handoff results for an issue.
@router.get("/api/repos/{owner}/{repo}/issues/{issue_number}/handoff")
async def get_issue_handoff_status(owner: str, repo: str, issue_number: int):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    record = get_handoff_result(repo_id, issue_number)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No handoff record found for issue #{issue_number}.")
    return record
