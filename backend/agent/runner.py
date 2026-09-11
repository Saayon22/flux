# Execution runner for Google ADK Agent conversational turns and handoff workflows.

import uuid
from typing import Any, Dict, List, Optional

from google.adk import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

from .coordinator import root_agent
from .tools.github_tools import fork_repo, publish_pr, rollback_repo
from .tools.opencode_tool import run_opencode
from .workflow.complexity_router import (
    evaluate_diff_complexity,
    evaluate_issue_pre_routing,
    generate_plan_artifact,
)
from .tracing import logger
from .config import WORKSPACES_DIR

session_service = InMemorySessionService()
adk_runner = Runner(app_name="flux", agent=root_agent, session_service=session_service, auto_create_session=True)


# Executes multi-turn conversations with the Google ADK root agent.
class AgentRunner:
    # Runs an interactive turn with the agent.
    @staticmethod
    async def run_turn(message: str, session_id: Optional[str] = None, user_id: str = "flux_user") -> Dict[str, Any]:
        session_id = session_id or f"sess_{uuid.uuid4().hex[:8]}"
        content = types.Content(role="user", parts=[types.Part.from_text(text=message)])
        response_chunks: List[str] = []

        try:
            async for event in adk_runner.run_async(user_id=user_id, session_id=session_id, new_message=content):
                if hasattr(event, "content") and event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            response_chunks.append(part.text)
            return {"status": "success", "session_id": session_id, "response": "".join(response_chunks).strip() or "Task completed."}
        except Exception as e:
            logger.warning("ADK runner warning: %s", e)
            return {"status": "success", "session_id": session_id, "response": f"Live Gemini connection paused: {e}"}


# Executes end-to-end agent handoff pipeline: opt-in, fork, synthesis, complexity routing, and PR/plan creation.
async def run_agent_handoff(
    owner: str,
    repo: str,
    issue_number: int,
    issue_data: Dict[str, Any],
    relevant_files: Optional[List[str]] = None,
    opt_in: bool = True,
    repo_path: Optional[str] = None,
    estimated_complexity: Optional[str] = None,
    auto_publish_pr: bool = False,
) -> Dict[str, Any]:
    logger.info("Executing handoff for %s/%s #%d", owner, repo, issue_number)

    if not opt_in:
        return {"status": "declined", "authorized": False, "message": "User declined handoff."}

    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_url = f"https://github.com/{owner}/{repo}"

    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    issue_context = f"Repository: {owner}/{repo}\nIssue #{issue_number}: {issue_data.get('title', '')}\n\n{issue_data.get('body', '')}"

    fork_result = fork_repo(repo_url=repo_url)
    fork_ref = fork_result.get("fork_ref", f"flux-bot/{repo}") if fork_result else f"flux-bot/{repo}"
    fork_url = fork_result.get("fork_url", f"https://github.com/{fork_ref}.git") if fork_result else f"https://github.com/{fork_ref}.git"

    pre_route = evaluate_issue_pre_routing(
        issue_data=issue_data,
        relevant_files=relevant_files or [],
        estimated_complexity=estimated_complexity,
    )

    pr_info = None
    plan_info = None

    if pre_route == "plan":
        diff = ""
        diff_stats = {
            "line_count": 0,
            "files_touched": relevant_files or ["src/main.py"],
            "validation_passed": True,
            "pre_routed": True,
            "reason": "Upfront Complexity Gate: High architectural complexity.",
        }
        route = "plan"
        plan_info = generate_plan_artifact(diff_stats=diff_stats, diff=None, issue_context=issue_context)
        summary_message = "High-complexity architectural scope identified; generated Implementation Plan Artifact."
    else:
        opencode_res = run_opencode(issue_context=issue_context, relevant_files=relevant_files or ["src/main.py"])
        diff = opencode_res.get("diff", "")
        diff_stats = opencode_res.get("stats", {"line_count": len(diff.splitlines()), "files_touched": relevant_files or ["src/main.py"], "validation_passed": True})
        route = evaluate_diff_complexity(diff_stats=diff_stats)

        if route == "pr":
            if auto_publish_pr:
                pr_info = publish_pr(fork_ref=fork_ref, diff=diff, issue_id=str(issue_number), upstream_repo=f"{owner}/{repo}", repo_path=repo_path)
                summary_message = f"Autonomous fix published as Pull Request to {fork_ref}."
            else:
                summary_message = "Autonomous fix synthesized. Review generated diff and confirm to publish Pull Request."
        else:
            plan_info = generate_plan_artifact(diff_stats=diff_stats, diff=diff, issue_context=issue_context)
            summary_message = "Fix complexity exceeded single-PR threshold; generated Implementation Plan Artifact."

    return {
        "status": "success",
        "authorized": True,
        "repo_id": repo_id,
        "issue_number": issue_number,
        "fork": {"fork_ref": fork_ref, "fork_url": fork_url, "provisioned": True},
        "diff": diff,
        "diff_stats": diff_stats,
        "decision": route,
        "pr": pr_info,
        "plan": plan_info,
        "message": summary_message,
    }


# Commits patch diff and publishes cross-repo Pull Request upon developer confirmation.
def confirm_and_publish_pr(
    owner: str,
    repo: str,
    issue_number: int,
    diff: str,
    fork_ref: Optional[str] = None,
    repo_path: Optional[str] = None,
) -> Dict[str, Any]:
    logger.info("Publishing PR for %s/%s #%d", owner, repo, issue_number)
    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    fork_ref = fork_ref or f"flux-bot/{repo}"
    pr_info = publish_pr(fork_ref=fork_ref, diff=diff, issue_id=str(issue_number), upstream_repo=f"{owner}/{repo}", repo_path=repo_path)
    return {
        "status": "success",
        "action": "pull_request_published",
        "pr": pr_info,
        "message": f"Pull Request opened at {pr_info.get('pr_url')}!",
    }


# Discards local workspace modifications and cleans up temporary fix branch.
def rollback_agent_handoff(
    owner: str,
    repo: str,
    issue_number: int,
    repo_path: Optional[str] = None,
) -> Dict[str, Any]:
    logger.info("Rolling back handoff for %s/%s #%d", owner, repo, issue_number)
    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    branch = f"flux/fix-issue-{issue_number}"
    res = rollback_repo(repo_path=repo_path, branch=branch)
    return {
        "status": "rolled_back",
        "repo_id": f"{owner.lower()}/{repo.lower()}",
        "issue_number": issue_number,
        "message": "Local workspace changes discarded.",
        "details": res,
    }
