# GitHub Issue Fetcher Service for retrieving and caching repository issues.

import json
from typing import List, Dict, Any, Tuple
import httpx

from config import settings
from models.database import save_issues, get_issues_by_repo_id
from models.issue import IssueSummary, IssueLabel


# Converts a SQLite row dictionary into an IssueSummary model.
def record_to_issue_summary(record: Dict[str, Any]) -> IssueSummary:
    labels_raw = json.loads(record.get("labels_json") or "[]")
    labels = [
        IssueLabel(name=l.get("name", ""), color=l.get("color", "71717a"), description=l.get("description"))
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


# Extracts a deduplicated list of all labels present across repository issue records.
def extract_available_labels(records: List[Dict[str, Any]]) -> List[IssueLabel]:
    label_map: Dict[str, IssueLabel] = {}
    for r in records:
        for l in json.loads(r.get("labels_json") or "[]"):
            name = l.get("name")
            if name and name not in label_map:
                label_map[name] = IssueLabel(name=name, color=l.get("color", "71717a"), description=l.get("description"))
    return sorted(list(label_map.values()), key=lambda x: x.name.lower())


# Fetches open GitHub issues for a repository from SQLite cache or live GitHub REST API.
async def fetch_repository_issues(
    owner: str,
    repo: str,
    force_refresh: bool = False,
    label_filter: str = "",
    state: str = "open",
) -> Tuple[List[IssueSummary], List[IssueLabel]]:
    repo_id = f"{owner.lower()}/{repo.lower()}"

    if not force_refresh:
        cached = get_issues_by_repo_id(repo_id, label_filter=label_filter, state=state)
        if cached:
            all_records = get_issues_by_repo_id(repo_id, state=state)
            return [record_to_issue_summary(r) for r in cached], extract_available_labels(all_records)

    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": settings.user_agent}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token.strip()}"

    url = f"{settings.github_api_url}/repos/{owner}/{repo}/issues"
    params = {"state": "open", "per_page": 50, "sort": "updated"}

    raw_items: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=max(settings.http_timeout, 15.0)) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                raw_items = resp.json()
            elif resp.status_code in (403, 429):
                cached = get_issues_by_repo_id(repo_id, label_filter=label_filter)
                if cached:
                    return [record_to_issue_summary(r) for r in cached], extract_available_labels(get_issues_by_repo_id(repo_id))
                raise RuntimeError("GitHub API rate limit exceeded.")
            elif resp.status_code == 404:
                raise ValueError(f"Repository '{owner}/{repo}' not found on GitHub.")
            else:
                resp.raise_for_status()
    except httpx.RequestError:
        cached = get_issues_by_repo_id(repo_id, label_filter=label_filter)
        if cached:
            return [record_to_issue_summary(r) for r in cached], extract_available_labels(get_issues_by_repo_id(repo_id))
        raise RuntimeError("Network error contacting GitHub API.")

    parsed_issues: List[Dict[str, Any]] = []
    for item in raw_items:
        if "pull_request" in item:
            continue
        labels_list = [{"name": l.get("name", ""), "color": l.get("color", "71717a"), "description": l.get("description")} for l in item.get("labels", [])]
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

    save_issues(repo_id, parsed_issues, mark_unseen_as_closed=True)
    records = get_issues_by_repo_id(repo_id, label_filter=label_filter, state=state)
    all_records = get_issues_by_repo_id(repo_id, state=state)
    return [record_to_issue_summary(r) for r in records], extract_available_labels(all_records)
