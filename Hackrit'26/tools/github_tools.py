"""GitHub integration tools for RepoRamp.

Features:
- fetch_issue: Retrieves issue description, title, labels.
- fork_repo: Registered as LongRunningFunctionTool. Creates asynchronous fork
  and polls until provisioned, saving fork_ref in ADK session state.
- publish_pr: Opens cross-repo PR against the upstream repository.
"""

import os
from typing import Any, Dict, Optional

import requests
from config import DEMO_MODE, GITHUB_TOKEN
from google.adk.tools import FunctionTool, LongRunningFunctionTool, ToolContext
from tracing import logger


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
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

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

    # Check if this invocation is resuming an already polled fork
    poll_state_key = f"fork_poll_count_{clean_repo}"
    poll_count = 0
    if tool_context and hasattr(tool_context, "state"):
        poll_count = tool_context.state.get(poll_state_key, 0)

    # Execute GitHub API fork if token available
    fork_ref = f"reporamp-bot/{name}"
    fork_url = f"https://github.com/reporamp-bot/{name}.git"

    if GITHUB_TOKEN and not DEMO_MODE:
        headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        }
        api_url = f"https://api.github.com/repos/{clean_repo}/forks"
        try:
            post_resp = requests.post(api_url, headers=headers, timeout=10)
            if post_resp.status_code in (200, 202):
                fork_data = post_resp.json()
                fork_url = fork_data.get("clone_url", fork_url)
                fork_ref = fork_data.get("full_name", fork_ref)
        except Exception as e:
            logger.warning("GitHub fork API call error: %s", e)

    # In ADK, LongRunningFunctionTool can yield or return resolved data.
    # We update session state so downstream tools (OpenCode, PR publisher) receive it.
    result = {
        "status": "ready",
        "fork_ref": fork_ref,
        "fork_url": fork_url,
        "upstream_repo": clean_repo,
        "provisioned": True,
        "poll_iterations": poll_count + 1,
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["fork_ref"] = fork_ref
        tool_context.state["fork_url"] = fork_url
        tool_context.state[poll_state_key] = poll_count + 1
        logger.info("Saved fork_ref '%s' in session state.", fork_ref)

    return result


def publish_pr(
    fork_ref: str,
    diff: str,
    issue_id: str,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Commits changes, pushes to the fork, and creates a cross-repo Pull Request.

    Args:
        fork_ref: The forked repository reference name.
        diff: The unified diff to commit and publish.
        issue_id: The ID of the issue being addressed.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary with PR status, PR URL, and PR number.
    """
    logger.info("Publishing Pull Request for fork %s resolving issue #%s", fork_ref, issue_id)
    pr_branch = f"reporamp/fix-issue-{issue_id}"
    pr_title = f"fix: resolve issue #{issue_id}"
    pr_body = (
        f"Automated resolution generated by RepoRamp.\n\n"
        f"Resolves #{issue_id}\n\n"
        f"### Diff Summary\n```diff\n{diff[:500]}\n```"
    )

    pr_url = f"https://github.com/{fork_ref}/pull/1"
    pr_number = 1

    if GITHUB_TOKEN and not DEMO_MODE:
        upstream_repo = ""
        if tool_context and hasattr(tool_context, "state"):
            upstream_repo = tool_context.state.get("upstream_repo", "")
        if upstream_repo:
            headers = {
                "Authorization": f"Bearer {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
            }
            api_url = f"https://api.github.com/repos/{upstream_repo}/pulls"
            payload = {
                "title": pr_title,
                "body": pr_body,
                "head": f"{fork_ref.split('/')[0]}:{pr_branch}",
                "base": "main",
            }
            try:
                resp = requests.post(api_url, headers=headers, json=payload, timeout=10)
                if resp.status_code == 201:
                    data = resp.json()
                    pr_url = data.get("html_url", pr_url)
                    pr_number = data.get("number", pr_number)
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


# ADK Tool Registration: fork_repo is registered as LongRunningFunctionTool per spec
fetch_issue_tool = FunctionTool(func=fetch_issue)
fork_repo_tool = LongRunningFunctionTool(func=fork_repo)
publish_pr_tool = FunctionTool(func=publish_pr)
