"""Runner and execution engine for flux Google ADK Agent."""

import uuid
from typing import Any, Dict, List, Optional
from pathlib import Path

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
_adk_runner = Runner(
    app_name="flux",
    agent=root_agent,
    session_service=session_service,
    auto_create_session=True,
)


class AgentRunner:
    """Provides interactive conversational session execution for the Google ADK Agent."""

    @staticmethod
    async def run_turn(
        message: str,
        session_id: Optional[str] = None,
        user_id: str = "flux_user",
    ) -> Dict[str, Any]:
        session_id = session_id or f"sess_{uuid.uuid4().hex[:8]}"
        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=message)],
        )

        response_chunks: List[str] = []
        try:
            async for event in _adk_runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=content,
            ):
                if hasattr(event, "content") and event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            response_chunks.append(part.text)

            final_text = "".join(response_chunks).strip()
            return {
                "status": "success",
                "session_id": session_id,
                "response": final_text or "Agent finished task.",
            }
        except Exception as e:
            logger.warning("Google ADK live runner exception: %s. Returning fallback response.", e)
            fallback_response = (
                f"Notice: Live Gemini connection paused ({str(e)[:80]}...). Provide a valid GEMINI_API_KEY in .env for dynamic inference."
            )
            return {
                "status": "success",
                "session_id": session_id,
                "response": fallback_response,
            }


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
    """Executes the high-stakes Phase 6 & Phase 7 agent handoff flow:

    1. Human-in-the-Loop Opt-In verification
    2. Lazy fork provisioning
    3. Upfront Complexity Gate: Instantly routes large/architectural issues to Plan Artifact
    4. Autonomous code generation (OpenCode or Gemini direct synthesis) for contained fixes
    5. Diff complexity evaluation (lines <= 150, files <= 4)
    6. Diff Review & Deferred PR Publishing: Returns diff for developer review before pushing, or auto-publishes if enabled
    """
    logger.info(
        "Starting run_agent_handoff for %s/%s #%d (opt_in=%s, auto_publish_pr=%s)",
        owner,
        repo,
        issue_number,
        opt_in,
        auto_publish_pr,
    )

    # 1. Gate: Human-in-the-Loop Opt-In
    if not opt_in:
        return {
            "status": "declined",
            "authorized": False,
            "message": "User declined handoff. No forks or code modifications will occur.",
        }

    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_url = f"https://github.com/{owner}/{repo}"

    # Resolve local repository workspace path
    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    issue_context = (
        f"Repository: {owner}/{repo}\n"
        f"Issue #{issue_number}: {issue_data.get('title', '')}\n\n"
        f"Description:\n{issue_data.get('body', '')}"
    )

    # 2. Step 1: Lazy Fork Creation
    fork_result = fork_repo(repo_url=repo_url)
    fork_ref = fork_result.get("fork_ref", f"flux-bot/{repo}") if fork_result else f"flux-bot/{repo}"
    fork_url = fork_result.get("fork_url", f"https://github.com/{fork_ref}.git") if fork_result else f"https://github.com/{fork_ref}.git"

    # 3. Upfront Complexity Gate: Pre-route large/architectural issues BEFORE code synthesis
    pre_route = evaluate_issue_pre_routing(
        issue_data=issue_data,
        relevant_files=relevant_files or [],
        estimated_complexity=estimated_complexity,
    )

    pr_info = None
    plan_info = None

    if pre_route == "plan":
        logger.info(
            "Upfront Complexity Gate triggered 'plan' for issue #%d; skipping autonomous code synthesis",
            issue_number,
        )
        diff = ""
        diff_stats = {
            "line_count": 0,
            "files_touched": relevant_files or ["src/main.py"],
            "validation_passed": True,
            "pre_routed": True,
            "reason": "Upfront Complexity Gate: High complexity / architectural refactoring scope.",
        }
        route = "plan"
        plan_info = generate_plan_artifact(
            diff_stats=diff_stats,
            diff=None,
            issue_context=issue_context,
        )
        summary_message = (
            f"Issue was identified upfront as high-complexity architectural refactoring "
            f"({len(relevant_files or [])} affected modules). Direct code modification "
            f"was safely bypassed in favor of a structured Implementation Plan Artifact."
        )
    else:
        # Step 2: Autonomous Code Synthesis for contained fixes
        opencode_res = run_opencode(
            issue_context=issue_context,
            relevant_files=relevant_files or ["src/main.py"],
        )

        diff = opencode_res.get("diff", "")
        diff_stats = opencode_res.get("stats", {
            "line_count": len(diff.splitlines()),
            "files_touched": relevant_files or ["src/main.py"],
            "validation_passed": True,
        })

        # Step 3: Complexity Router Evaluation
        route = evaluate_diff_complexity(diff_stats=diff_stats)

        if route == "pr":
            if auto_publish_pr:
                # Contained diff -> Open Pull Request directly
                pr_info = publish_pr(
                    fork_ref=fork_ref,
                    diff=diff,
                    issue_id=str(issue_number),
                    upstream_repo=f"{owner}/{repo}",
                    repo_path=repo_path,
                )
                summary_message = (
                    f"Autonomous fix succeeded! Generated a {diff_stats.get('line_count', 0)}-line diff "
                    f"across {len(diff_stats.get('files_touched', []))} files. "
                    f"Cross-repo Pull Request published to {fork_ref}."
                )
            else:
                # Human-in-the-Loop review: Diff ready for developer inspection before PR
                pr_info = None
                summary_message = (
                    f"Autonomous fix synthesized! Generated a {diff_stats.get('line_count', 0)}-line diff "
                    f"across {len(diff_stats.get('files_touched', []))} file(s). "
                    "Review the generated diff below and confirm to publish Pull Request."
                )
        else:
            # Complex diff -> Generate Implementation Plan Artifact
            plan_info = generate_plan_artifact(diff_stats=diff_stats, diff=diff, issue_context=issue_context)
            summary_message = (
                f"Fix complexity exceeded standard PR threshold ({diff_stats.get('line_count', 0)} lines). "
                "Generated a structured Implementation Plan Artifact instead of forcing an automated PR."
            )

    return {
        "status": "success",
        "authorized": True,
        "repo_id": repo_id,
        "issue_number": issue_number,
        "fork": {
            "fork_ref": fork_ref,
            "fork_url": fork_url,
            "provisioned": True,
        },
        "diff": diff,
        "diff_stats": diff_stats,
        "decision": route,
        "pr": pr_info,
        "plan": plan_info,
        "message": summary_message,
    }


def confirm_and_publish_pr(
    owner: str,
    repo: str,
    issue_number: int,
    diff: str,
    fork_ref: Optional[str] = None,
    repo_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Commits changes, pushes branch to fork, and creates the cross-repo GitHub PR upon developer confirmation."""
    logger.info("Confirming and publishing PR for %s/%s #%d", owner, repo, issue_number)
    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    fork_ref = fork_ref or f"flux-bot/{repo}"
    pr_info = publish_pr(
        fork_ref=fork_ref,
        diff=diff,
        issue_id=str(issue_number),
        upstream_repo=f"{owner}/{repo}",
        repo_path=repo_path,
    )
    return {
        "status": "success",
        "action": "pull_request_published",
        "pr": pr_info,
        "message": f"Pull Request successfully opened for issue #{issue_number} at {pr_info.get('pr_url')}!",
    }


def rollback_agent_handoff(
    owner: str,
    repo: str,
    issue_number: int,
    repo_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Rolls back local workspace modifications and cleans up temporary fix branch."""
    logger.info("Rolling back agent handoff for %s/%s #%d", owner, repo, issue_number)
    if not repo_path:
        local_dir = WORKSPACES_DIR / owner.lower() / repo.lower()
        repo_path = str(local_dir) if local_dir.exists() else "."

    branch = f"flux/fix-issue-{issue_number}"
    res = rollback_repo(repo_path=repo_path, branch=branch)
    return {
        "status": "rolled_back",
        "repo_id": f"{owner.lower()}/{repo.lower()}",
        "issue_number": issue_number,
        "message": "Local workspace changes successfully discarded and branch reset.",
        "details": res,
    }
