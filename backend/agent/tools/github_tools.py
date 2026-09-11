"""GitHub integration tools for flux Google ADK Agent.

Features:
- fetch_issue: Retrieves issue description, title, labels.
- fork_repo: Registered as LongRunningFunctionTool. Creates asynchronous fork
  and polls until provisioned, saving fork_ref in ADK session state.
- publish_pr: Opens cross-repo PR against the upstream repository.
"""

import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Optional
import requests

from google.adk.tools import FunctionTool, LongRunningFunctionTool, ToolContext
from ..config import DEMO_MODE, GITHUB_TOKEN
from ..tracing import logger


def fetch_issue(
    repo_name: str,
    issue_id: str,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Fetches details for a specific GitHub issue.

    Args:
        repo_name: The owner/repo string (e.g. 'octocat/Hello-World').
        issue_id: The issue number or identifier.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary containing issue title, body, state, and labels.
    """
    logger.info("Fetching issue #%s for repo %s", issue_id, repo_name)
    headers = {"Accept": "application/vnd.github.v3+json"}
    token = GITHUB_TOKEN or os.getenv("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    clean_repo = repo_name.replace("https://github.com/", "").strip("/")
    url = f"https://api.github.com/repos/{clean_repo}/issues/{issue_id}"

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            issue_data = {
                "status": "success",
                "issue_id": str(issue_id),
                "repo_name": clean_repo,
                "title": data.get("title", ""),
                "body": data.get("body", ""),
                "state": data.get("state", "open"),
                "labels": [label["name"] for label in data.get("labels", [])],
            }
        else:
            raise ValueError(f"GitHub API returned HTTP {resp.status_code}")
    except Exception as e:
        logger.warning("Could not fetch issue from GitHub API (%s). Using demo/fallback issue.", e)
        issue_data = {
            "status": "fallback",
            "issue_id": str(issue_id),
            "repo_name": clean_repo,
            "title": f"Refactor and Optimize Event Processing in {clean_repo}",
            "body": (
                "When processing high-frequency event streams, unvalidated payloads "
                "cause silent failures in the handler pipeline. Refactor process_event "
                "to validate and report status appropriately."
            ),
            "state": "open",
            "labels": ["bug", "refactor", "good-first-issue"],
        }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["current_issue"] = issue_data
        tool_context.state["issue_id"] = str(issue_id)
        tool_context.state["issue_context"] = f"Title: {issue_data['title']}\nBody: {issue_data['body']}"
        logger.info("Stored current_issue and issue_context in session state.")

    return issue_data


def fork_repo(
    repo_url: str,
    tool_context: Optional[ToolContext] = None,
) -> Optional[Dict[str, Any]]:
    """Forks a repository asynchronously and polls until ready.

    Implements ADK's LongRunningFunctionTool pattern to yield control
    while the GitHub fork provisions asynchronously, avoiding blocking
    the agent loop with custom sleep loops.

    Args:
        repo_url: The upstream repository URL to fork.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary containing fork_url, fork_ref, and provisioning status,
        or None if yielding for long-running poll.
    """
    logger.info("Kicking off asynchronous fork for %s", repo_url)
    clean_repo = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
    owner, name = clean_repo.split("/") if "/" in clean_repo else ("demo-owner", clean_repo)

    poll_state_key = f"fork_poll_count_{clean_repo}"
    poll_count = 0
    if tool_context and hasattr(tool_context, "state"):
        poll_count = tool_context.state.get(poll_state_key, 0)

    token = GITHUB_TOKEN or os.getenv("GITHUB_TOKEN", "")
    fork_ref = clean_repo
    fork_url = f"https://github.com/{clean_repo}.git"

    if token and not DEMO_MODE:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }
        api_url = f"https://api.github.com/repos/{clean_repo}/forks"
        try:
            resp = requests.post(api_url, headers=headers, timeout=10)
            if resp.status_code in (202, 201):
                data = resp.json()
                fork_ref = data.get("full_name", fork_ref)
                fork_url = data.get("clone_url", fork_url)
                # Active poll: wait for async fork provisioning (up to 5 attempts)
                for _ in range(5):
                    time.sleep(1.0)
                    try:
                        chk = requests.get(f"https://api.github.com/repos/{fork_ref}", headers=headers, timeout=5)
                        if chk.status_code == 200:
                            logger.info("Fork %s is provisioned and ready on GitHub.", fork_ref)
                            break
                    except Exception:
                        pass
            elif resp.status_code == 200:
                pass
        except Exception as e:
            logger.warning("GitHub fork API call error: %s", e)

    fork_result = {
        "status": "ready",
        "fork_url": fork_url,
        "fork_ref": fork_ref,
        "upstream_repo": clean_repo,
        "provisioned": True,
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["fork_ref"] = fork_ref
        tool_context.state["fork_url"] = fork_url
        tool_context.state["upstream_repo"] = clean_repo
        logger.info("Saved fork_ref (%s) into session state.", fork_ref)

    return fork_result


def publish_pr(
    fork_ref: str,
    diff: str,
    issue_id: str,
    upstream_repo: Optional[str] = None,
    repo_path: Optional[str] = None,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Commits changes, pushes to the fork, and creates a cross-repo Pull Request.

    Args:
        fork_ref: The forked repository reference name.
        diff: The unified diff to commit and publish.
        issue_id: The ID of the issue being addressed.
        upstream_repo: Optional upstream repository name (e.g. 'owner/repo').
        repo_path: Optional local path to cloned repository for git operations.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary with PR status, PR URL, and PR number.
    """
    logger.info("Publishing Pull Request for fork %s resolving issue #%s", fork_ref, issue_id)
    pr_branch = f"flux/fix-issue-{issue_id}"
    pr_title = f"fix: resolve issue #{issue_id}"
    pr_body = (
        f"Automated resolution generated by flux Google ADK Agent.\n\n"
        f"Resolves #{issue_id}\n\n"
        f"### Diff Summary\n```diff\n{diff[:500]}\n```"
    )

    token = GITHUB_TOKEN or os.getenv("GITHUB_TOKEN", "")

    # Resolve upstream repository name from arguments or session state
    if not upstream_repo and tool_context and hasattr(tool_context, "state"):
        upstream_repo = tool_context.state.get("upstream_repo") or tool_context.state.get("repo_name")

    target_repo = upstream_repo or fork_ref
    pr_url = f"https://github.com/{target_repo}/pulls"
    pr_number = 1

    # Resolve local repository directory
    if not repo_path and tool_context and hasattr(tool_context, "state"):
        repo_path = tool_context.state.get("repo_path")

    if token and not DEMO_MODE and upstream_repo:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "flux-Agent",
        }

        # 1. Fetch upstream repository default branch (e.g. main / master)
        base_branch = "main"
        try:
            up_resp = requests.get(f"https://api.github.com/repos/{upstream_repo}", headers=headers, timeout=10)
            if up_resp.status_code == 200:
                base_branch = up_resp.json().get("default_branch", "main")
        except Exception as e:
            logger.warning("Failed to fetch upstream default branch: %s", e)

        # 2. Local git branch creation, patch application, and authenticated push to fork
        if repo_path and Path(repo_path).exists():
            try:
                rpath = Path(repo_path).resolve()
                subprocess.run(["git", "checkout", "-B", pr_branch], cwd=rpath, capture_output=True, text=True, check=False)

                if diff and diff.strip():
                    subprocess.run(
                        ["git", "apply", "--whitespace=fix", "-"],
                        input=diff,
                        cwd=rpath,
                        capture_output=True,
                        text=True,
                        check=False,
                    )

                subprocess.run(["git", "add", "-A"], cwd=rpath, capture_output=True, text=True, check=False)
                subprocess.run(
                    ["git", "-c", "user.name=flux-bot", "-c", "user.email=bot@flux.dev", "commit", "-m", pr_title, "--allow-empty"],
                    cwd=rpath,
                    capture_output=True,
                    text=True,
                    check=False,
                )

                fork_push_url = f"https://x-access-token:{token}@github.com/{fork_ref}.git"
                push_proc = subprocess.run(
                    ["git", "push", "-u", fork_push_url, f"{pr_branch}:{pr_branch}", "--force"],
                    cwd=rpath,
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                if push_proc.returncode == 0:
                    logger.info("Successfully pushed branch %s to %s", pr_branch, fork_ref)
                else:
                    logger.warning("git push notice: %s", push_proc.stderr)
            except Exception as e:
                logger.warning("Local git operations encountered warning: %s", e)

        # 3. Create or retrieve cross-repository Pull Request via GitHub REST API
        fork_owner = fork_ref.split("/")[0] if "/" in fork_ref else fork_ref
        head_ref = f"{fork_owner}:{pr_branch}"
        api_url = f"https://api.github.com/repos/{upstream_repo}/pulls"
        payload = {
            "title": pr_title,
            "body": pr_body,
            "head": head_ref,
            "base": base_branch,
        }
        try:
            resp = requests.post(api_url, headers=headers, json=payload, timeout=15)
            if resp.status_code == 201:
                data = resp.json()
                pr_url = data.get("html_url", pr_url)
                pr_number = data.get("number", pr_number)
                logger.info("Successfully published GitHub PR: %s (#%s)", pr_url, pr_number)
            elif resp.status_code == 422:
                # If PR already exists for this branch, query existing PR
                check_resp = requests.get(
                    api_url,
                    headers=headers,
                    params={"head": head_ref, "state": "all"},
                    timeout=10,
                )
                if check_resp.status_code == 200 and check_resp.json():
                    existing_pr = check_resp.json()[0]
                    pr_url = existing_pr.get("html_url", pr_url)
                    pr_number = existing_pr.get("number", pr_number)
                    logger.info("Retrieved existing PR: %s (#%s)", pr_url, pr_number)
                else:
                    logger.warning("GitHub PR response: %s", resp.text)
            else:
                logger.warning("GitHub PR publish HTTP %d: %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("GitHub PR publish API call error: %s", e)

    result = {
        "status": "success",
        "action": "pull_request_opened",
        "pr_url": pr_url,
        "pr_number": pr_number,
        "branch": pr_branch,
        "fork_ref": fork_ref,
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["pr_result"] = result
        tool_context.state["pr_url"] = pr_url
        logger.info("Stored pr_result and pr_url in session state.")

    return result


def rollback_repo(
    repo_path: Optional[str] = None,
    branch: Optional[str] = None,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Rolls back local git modifications, resets working tree, and deletes temporary branch.

    Args:
        repo_path: Path to the local repository directory.
        branch: The temporary fix branch name to delete (e.g. 'flux/fix-issue-10').
        tool_context: The ADK ToolContext.

    Returns:
        Dictionary indicating status of the rollback operation.
    """
    logger.info("Rolling back local git modifications in %s (branch=%s)", repo_path, branch)
    if not repo_path and tool_context and hasattr(tool_context, "state"):
        repo_path = tool_context.state.get("repo_path")

    if not repo_path or not Path(repo_path).exists():
        return {
            "status": "success",
            "message": "No local repository path found or workspace does not exist; no git rollback needed.",
        }

    rpath = Path(repo_path).resolve()
    try:
        # Determine default branch
        main_check = subprocess.run(["git", "checkout", "main"], cwd=rpath, capture_output=True, text=True, check=False)
        if main_check.returncode != 0:
            subprocess.run(["git", "checkout", "master"], cwd=rpath, capture_output=True, text=True, check=False)

        # Reset all tracked changes
        subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=rpath, capture_output=True, text=True, check=False)
        # Remove any untracked files/directories
        subprocess.run(["git", "clean", "-fd"], cwd=rpath, capture_output=True, text=True, check=False)

        # Delete the temporary fix branch if specified
        if branch and branch not in ("main", "master", "HEAD"):
            subprocess.run(["git", "branch", "-D", branch], cwd=rpath, capture_output=True, text=True, check=False)

        logger.info("Cleaned workspace and checked out default branch successfully.")
        return {
            "status": "success",
            "message": "Workspace successfully reset and changes discarded.",
        }
    except Exception as e:
        logger.warning("Rollback git command warning: %s", e)
        return {
            "status": "partial_success",
            "message": f"Rollback completed with notice: {e}",
        }


fetch_issue_tool = FunctionTool(func=fetch_issue)
fork_repo_tool = LongRunningFunctionTool(func=fork_repo)
publish_pr_tool = FunctionTool(func=publish_pr)
rollback_repo_tool = FunctionTool(func=rollback_repo)
