"""
FastAPI Router for GitHub Issue Discovery and Explanation endpoints.
Handles listing open issues, label filtering, and on-demand graph-grounded explanations.
"""

import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from config import settings
from models.database import (
    get_repository_by_id,
    get_graph_by_repo_id,
    save_graph,
    get_issue_explanation,
    save_issue_explanation,
    get_issues_by_repo_id,
    save_issues,
)
from models.graph import GraphResponse
from models.issue import (
    IssueListResponse,
    IssueExplanation,
    RelevantFileItem,
    IssueSummary,
)
from services.parser import parse_repository
from services.graph import build_repository_graph
from services.issue_fetcher import fetch_repository_issues
from services.issue_relevance import find_relevant_graph_context
from services.issue_explainer import generate_issue_explanation

router = APIRouter(prefix="/api/repos", tags=["issues"])


@router.get("/{owner}/{repo}/issues", response_model=IssueListResponse)
async def list_issues_endpoint(
    owner: str,
    repo: str,
    label: Optional[str] = Query(None, description="Optional label name to filter issues"),
    force_refresh: bool = Query(False, description="Force re-fetching from GitHub API"),
):
    """
    Lists open issues for a repository, optionally filtered by label.
    Pulls from SQLite cache or fetches live from GitHub REST API.
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{owner}/{repo}' has not been ingested yet. Please ingest it first."
        )

    try:
        issues, available_labels = await fetch_repository_issues(
            owner=owner,
            repo=repo,
            force_refresh=force_refresh,
            label_filter=label or "",
        )

        return IssueListResponse(
            repo_id=repo_id,
            total_count=len(issues),
            available_labels=available_labels,
            issues=issues,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(re))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch issues: {str(e)}"
        )


@router.post("/{owner}/{repo}/issues/{issue_number}/explain", response_model=IssueExplanation)
async def explain_issue_endpoint(owner: str, repo: str, issue_number: int):
    """
    Generates or retrieves a cached plain-English explanation, analogy, and task checklist
    for a specific GitHub issue, grounded in the 1-hop dependency graph neighborhood.
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{owner}/{repo}' has not been ingested yet."
        )

    # 1. Check if explanation is already cached in database
    cached_exp = get_issue_explanation(repo_id, issue_number)
    if cached_exp:
        relevant_files_raw = json.loads(cached_exp["relevant_files_json"])
        relevant_files = [RelevantFileItem(**rf) for rf in relevant_files_raw]
        steps = json.loads(cached_exp["implementation_steps_json"])

        return IssueExplanation(
            issue_id=cached_exp["id"],
            repo_id=cached_exp["repo_id"],
            issue_number=cached_exp["issue_number"],
            plain_english_summary=cached_exp["plain_english_summary"],
            real_world_analogy=cached_exp["real_world_analogy"],
            relevant_files=relevant_files,
            implementation_steps=steps,
            estimated_complexity=cached_exp["estimated_complexity"],
            model_used=cached_exp["model_used"],
            is_fallback=bool(cached_exp["is_fallback"]),
            created_at=cached_exp["created_at"],
        )

    # 2. Get issue record
    issues_list = get_issues_by_repo_id(repo_id)
    target_issue = next((i for i in issues_list if i["issue_number"] == issue_number), None)
    if not target_issue:
        # Fetch fresh issues
        await fetch_repository_issues(owner, repo)
        issues_list = get_issues_by_repo_id(repo_id)
        target_issue = next((i for i in issues_list if i["issue_number"] == issue_number), None)

    if not target_issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue #{issue_number} not found for repository '{owner}/{repo}'."
        )

    # 3. Retrieve or build AST dependency graph
    graph_record = get_graph_by_repo_id(repo_id)
    if graph_record:
        graph_response = GraphResponse(**json.loads(graph_record["graph_json"]))
    else:
        target_dir = settings.workspaces_dir / repo_record["owner"] / repo_record["name"]
        if not target_dir.exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Local workspace directory '{target_dir}' not found."
            )
        parse_results = parse_repository(target_dir)
        now_iso = datetime.now(timezone.utc).isoformat()
        graph_response = build_repository_graph(parse_results, repo_id, now_iso)
        save_graph(
            repo_id=repo_id,
            nodes_count=graph_response.metrics.total_nodes,
            edges_count=graph_response.metrics.total_edges,
            metrics_json=graph_response.metrics.model_dump_json(),
            graph_json=graph_response.model_dump_json(),
            now_iso=now_iso,
        )

    # 4. Extract grounded 1-hop graph relevance
    contexts = find_relevant_graph_context(
        issue_title=target_issue["title"],
        issue_body=target_issue.get("body") or "",
        graph=graph_response,
    )

    # 5. Generate structured explanation via LLM or grounded fallback
    explanation = await generate_issue_explanation(
        issue_data=target_issue,
        graph_contexts=contexts,
        repo_id=repo_id,
        issue_number=issue_number,
    )

    # 6. Cache explanation in SQLite
    now_iso = datetime.now(timezone.utc).isoformat()
    save_issue_explanation(
        repo_id=repo_id,
        issue_number=issue_number,
        data={
            "plain_english_summary": explanation.plain_english_summary,
            "real_world_analogy": explanation.real_world_analogy,
            "implementation_steps_json": json.dumps(explanation.implementation_steps),
            "relevant_files_json": json.dumps([rf.model_dump() for rf in explanation.relevant_files]),
            "estimated_complexity": explanation.estimated_complexity,
            "model_used": explanation.model_used,
            "is_fallback": explanation.is_fallback,
        },
        now_iso=now_iso,
    )

    return explanation


@router.post("/{owner}/{repo}/issues/seed", response_model=IssueSummary)
async def seed_demo_issue_endpoint(owner: str, repo: str):
    """
    Seeds a realistic demo issue for repositories that currently have 0 open GitHub issues.
    Enables testing and rehearsing the live end-to-end issue explanation and handoff demo.
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{owner}/{repo}' has not been ingested yet."
        )

    # Check top central files from graph
    graph_record = get_graph_by_repo_id(repo_id)
    top_file = "README.md"
    if graph_record:
        g = GraphResponse(**json.loads(graph_record["graph_json"]))
        if g.nodes:
            top_file = g.nodes[0].id

    now_iso = datetime.now(timezone.utc).isoformat()
    demo_issue = {
        "number": 101,
        "title": f"Enhance module handling and add validation in {top_file}",
        "body": f"The implementation in `{top_file}` should be enhanced with robust input validation, improved error handling for unexpected request parameters, and comprehensive unit test coverage.",
        "state": "open",
        "author": "demo-contributor",
        "labels_json": json.dumps([
            {"name": "enhancement", "color": "a2eeef", "description": "New feature or request"},
            {"name": "good first issue", "color": "7057ff", "description": "Good for newcomers"}
        ]),
        "comments_count": 1,
        "html_url": f"https://github.com/{owner}/{repo}/issues/101",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    save_issues(repo_id, [demo_issue])
    from services.issue_fetcher import _record_to_issue_summary
    return _record_to_issue_summary({
        "id": f"{repo_id}#101",
        "repo_id": repo_id,
        "issue_number": 101,
        "title": demo_issue["title"],
        "body": demo_issue["body"],
        "state": "open",
        "author": "demo-contributor",
        "labels_json": demo_issue["labels_json"],
        "comments_count": 1,
        "github_url": demo_issue["html_url"],
        "created_at": now_iso,
        "updated_at": now_iso,
    })
