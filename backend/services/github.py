# GitHub REST API integration for URL parsing and repository metadata retrieval.

import re
from typing import Tuple, Dict, Any
import httpx
from config import settings


# Normalizes and extracts owner and repository name from GitHub URLs or shorthand formats.
def parse_github_url(raw_url: str) -> Tuple[str, str]:
    clean_url = raw_url.strip()

    # Matches https, http, or git SSH URLs
    match = re.search(r"(?:https?://github\.com/|git@github\.com:)([\w\-\.]+)/([\w\-\.]+?)(?:\.git|/)?$", clean_url, re.IGNORECASE)
    if match:
        return match.group(1), match.group(2)

    # Matches owner/repo shorthand format
    shorthand = re.match(r"^([\w\-\.]+)/([\w\-\.]+)$", clean_url)
    if shorthand:
        owner, repo = shorthand.group(1), shorthand.group(2)
        return owner, repo[:-4] if repo.endswith(".git") else repo

    raise ValueError(f"Invalid GitHub repository URL or format: '{raw_url}'")


# Fetches repository metadata from GitHub REST API with fallback for rate limits.
async def fetch_repo_metadata(owner: str, repo: str) -> Dict[str, Any]:
    api_url = f"{settings.github_api_url}/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": settings.user_agent}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
            resp = await client.get(api_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "owner": data.get("owner", {}).get("login", owner),
                    "name": data.get("name", repo),
                    "description": data.get("description") or "",
                    "default_branch": data.get("default_branch", "main"),
                    "language": data.get("language") or "Unknown",
                    "stars": data.get("stargazers_count", 0),
                    "open_issues_count": data.get("open_issues_count", 0),
                    "clone_url": data.get("clone_url") or f"https://github.com/{owner}/{repo}.git",
                }
            elif resp.status_code == 404:
                raise ValueError(f"Repository '{owner}/{repo}' not found on GitHub.")
    except httpx.HTTPError:
        pass

    return {
        "owner": owner,
        "name": repo,
        "description": "Ingested without live API metadata",
        "default_branch": "main",
        "language": "Unknown",
        "stars": 0,
        "open_issues_count": 0,
        "clone_url": f"https://github.com/{owner}/{repo}.git",
    }
