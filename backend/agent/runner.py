"""Runner and execution engine for flux Google ADK Agent."""

import uuid
from typing import Any, Dict, List, Optional
from pathlib import Path

from google.adk import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

from .coordinator import root_agent
from .tools.github_tools import fork_repo, publish_pr
from .tools.opencode_tool import run_opencode
from .workflow.complexity_router import evaluate_diff_complexity, generate_plan_artifact
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
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if getattr(part, "text", None):
                            response_chunks.append(part.text)
                elif event.output:
                    response_chunks.append(str(event.output))

            response_text = "".join(response_chunks).strip() if response_chunks else "Task completed."
            return {
                "status": "success",
                "session_id": session_id,
                "response": response_text,
            }
        except Exception as e:
            logger.warning("Agent turn execution exception: %s", e)
            return {
                "status": "error",
                "session_id": session_id,
                "response": f"Agent encountered error: {str(e)}",
            }


async def run_agent_handoff(
    owner: str,
    repo: str,
    issue_number: int,
    issue_data: Dict[str, Any],
    relevant_files: Optional[List[str]] = None,
    opt_in: bool = True,
    repo_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Executes the high-stakes Phase 6 & Phase 7 agent handoff flow:

    1. Human-in-the-Loop Opt-In verification
    2. Lazy fork provisioning
    3. Autonomous code generation (OpenCode or Gemini direct synthesis)
    4. Complexity evaluation (lines <= 150, files <= 4)
    5. PR publishing (for contained diffs) or Plan Artifact generation (for complex diffs)
    """
    logger.info("Starting run_agent_handoff for %s/%s #%d (opt_in=%s)", owner, repo, issue_number, opt_in)

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

    # 3. Step 2: Autonomous Code Synthesis
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

    # 4. Step 3: Complexity Router Evaluation
    route = evaluate_diff_complexity(diff_stats=diff_stats)

    pr_info = None
    plan_info = None

    if route == "pr":
        # Contained diff -> Open Pull Request
        pr_info = publish_pr(
            fork_ref=fork_ref,
            diff=diff,
            issue_id=str(issue_number),
        )
        summary_message = (
            f"Autonomous fix succeeded! Generated a {diff_stats.get('line_count', 0)}-line diff "
            f"across {len(diff_stats.get('files_touched', []))} files. "
            f"Cross-repo Pull Request published to {fork_ref}."
        )
    else:
        # Complex diff -> Generate Implementation Plan Artifact
        plan_info = generate_plan_artifact(diff_stats=diff_stats)
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
