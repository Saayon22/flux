"""
GitHub Issue Fetcher Service.
Fetches open issues from GitHub REST API, filters out pull requests, extracts labels,
and persists them into SQLite for fast caching and offline reliability.
"""

import json
from typing import List, Dict, Any, Tuple
import httpx

from config import settings
from models.database import save_issues, get_issues_by_repo_id
from models.issue import IssueSummary, IssueLabel


async def fetch_repository_issues(
    owner: str,
    repo: str,
    force_refresh: bool = False,
    label_filter: str = "",
    state: str = "open",
) -> Tuple[List[IssueSummary], List[IssueLabel]]:
    """
    Fetches open GitHub issues for a repository, either from cache or live GitHub API.
    
    Args:
        owner: GitHub repository owner.
        repo: GitHub repository name.
        force_refresh: If True, fetches fresh issues from GitHub even if cached.
        label_filter: Optional label name to filter issues.
        state: Issue state ('open', 'closed', or 'all').
        
    Returns:
        Tuple of (list of IssueSummary models, list of all available IssueLabel models).
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"

    # 1. Check SQLite cache first unless force refresh requested
    if not force_refresh:
        cached_records = get_issues_by_repo_id(repo_id, label_filter=label_filter, state=state)
        if cached_records:
            all_records = get_issues_by_repo_id(repo_id, state=state)
            available_labels = _extract_available_labels(all_records)
            issue_summaries = [_record_to_issue_summary(r) for r in cached_records]
            return issue_summaries, available_labels

    # 2. Fetch live issues from GitHub API
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "flux-app/1.0",
    }
    if settings.github_token and settings.github_token.strip():
        headers["Authorization"] = f"Bearer {settings.github_token.strip()}"

    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    params = {
        "state": "open",
        "per_page": 50,
        "sort": "updated",
    }

    raw_items: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                raw_items = resp.json()
            elif resp.status_code in (403, 429):
                # Rate limit encountered - log warning and try falling back to cache
                print(f"[WARN] GitHub API rate limited ({resp.status_code}). Attempting cache fallback.")
                cached_records = get_issues_by_repo_id(repo_id, label_filter=label_filter)
                if cached_records:
                    all_records = get_issues_by_repo_id(repo_id)
                    return (
                        [_record_to_issue_summary(r) for r in cached_records],
                        _extract_available_labels(all_records),
                    )
                else:
                    raise RuntimeError(
                        f"GitHub API rate limit exceeded ({resp.status_code}). "
                        "Please provide a GITHUB_TOKEN in your .env file or wait for the limit to reset."
                    )
            elif resp.status_code == 404:
                raise ValueError(f"Repository '{owner}/{repo}' not found on GitHub.")
            else:
                resp.raise_for_status()

    except httpx.RequestError as exc:
        print(f"[WARN] Network error contacting GitHub API: {exc}. Trying cache.")
        cached_records = get_issues_by_repo_id(repo_id, label_filter=label_filter)
        if cached_records:
            all_records = get_issues_by_repo_id(repo_id)
            return (
                [_record_to_issue_summary(r) for r in cached_records],
                _extract_available_labels(all_records),
            )
        raise RuntimeError(f"Network error contacting GitHub API: {str(exc)}")

    # 3. Filter out Pull Requests (GitHub issues API returns PRs as issues unless filtered)
    parsed_issues: List[Dict[str, Any]] = []
    for item in raw_items:
        if "pull_request" in item:
            continue

        labels_list = [
            {
                "name": l.get("name", ""),
                "color": l.get("color", "71717a"),
                "description": l.get("description"),
            }
            for l in item.get("labels", [])
        ]

        parsed_issues.append({
            "number": item["number"],
            "title": item["title"],
            "body": item.get("body") or "",
            "state": item.get("state", "open"),
            "author": item.get("user", {}).get("login", "unknown") if item.get("user") else "unknown",
            "labels_json": json.dumps(labels_list),
            "comments_count": item.get("comments", 0),
            "html_url": item.get("html_url", f"https://github.com/{owner}/{repo}/issues/{item['number']}"),
            "created_at": item.get("created_at") or "",
            "updated_at": item.get("updated_at") or "",
        })

    # 4. Save parsed issues into SQLite, automatically marking any previously stored issues that are not in the response as closed
    save_issues(repo_id, parsed_issues, mark_unseen_as_closed=True)

    # 5. Fetch filtered from database to guarantee consistent sorting and label filtering
    records = get_issues_by_repo_id(repo_id, label_filter=label_filter, state=state)
    all_records = get_issues_by_repo_id(repo_id, state=state)
    available_labels = _extract_available_labels(all_records)
    issue_summaries = [_record_to_issue_summary(r) for r in records]

    return issue_summaries, available_labels


def _record_to_issue_summary(record: Dict[str, Any]) -> IssueSummary:
    """Converts a SQLite row dictionary to an IssueSummary model."""
    labels_raw = json.loads(record.get("labels_json") or "[]")
    labels = [
        IssueLabel(
            name=l.get("name", ""),
            color=l.get("color", "71717a"),
            description=l.get("description"),
        )
        for l in labels_raw
    ]

    return IssueSummary(
        id=record["id"],
        number=record["issue_number"],
        title=record["title"],
        body=record.get("body") or "",
        state=record.get("state", "open"),
        author=record.get("author") or "",
        labels=labels,
        comments_count=record.get("comments_count", 0),
        html_url=record.get("github_url") or "",
        created_at=record.get("created_at") or "",
    )


def _extract_available_labels(records: List[Dict[str, Any]]) -> List[IssueLabel]:
    """Extracts deduplicated list of all labels present across repository issues."""
    label_map: Dict[str, IssueLabel] = {}
    for r in records:
        labels_raw = json.loads(r.get("labels_json") or "[]")
        for l in labels_raw:
            name = l.get("name")
            if name and name not in label_map:
                label_map[name] = IssueLabel(
                    name=name,
                    color=l.get("color", "71717a"),
                    description=l.get("description"),
                )
    return sorted(list(label_map.values()), key=lambda x: x.name.lower())
