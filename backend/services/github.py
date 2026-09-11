"""
GitHub REST API integration service.
Handles repository URL normalization and metadata extraction from GitHub's REST API.
"""

import re
from typing import Tuple, Dict, Any, Optional
import httpx
from config import settings


def parse_github_url(raw_url: str) -> Tuple[str, str]:
    """
    Normalizes and extracts (owner, repo) from various GitHub URL formats or shorthands.
    
    Supported formats:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - http://github.com/owner/repo/
    - git@github.com:owner/repo.git
    - owner/repo
    
    Raises:
        ValueError: If the URL cannot be parsed into a valid owner/repo pair.
    """
    clean_url = raw_url.strip()

    # Pattern for https / http / git protocols
    match = re.search(
        r"(?:https?://github\.com/|git@github\.com:)([\w\-\.]+)/([\w\-\.]+?)(?:\.git|/)?$",
        clean_url,
        re.IGNORECASE,
    )
    if match:
        owner, repo = match.group(1), match.group(2)
        return owner, repo

    # Pattern for simple shorthand "owner/repo"
    shorthand_match = re.match(r"^([\w\-\.]+)/([\w\-\.]+)$", clean_url)
    if shorthand_match:
        owner, repo = shorthand_match.group(1), shorthand_match.group(2)
        if repo.endswith(".git"):
            repo = repo[:-4]
        return owner, repo

    raise ValueError(f"Invalid GitHub repository URL or format: '{raw_url}'")


async def fetch_repo_metadata(owner: str, repo: str) -> Dict[str, Any]:
    """
    Fetches repository metadata from GitHub REST API (v3).
    
    If GITHUB_TOKEN is provided in settings, it is attached to raise rate limits.
    If the API call fails due to rate limits or network issues, falls back gracefully
    with baseline metadata so ingestion can still proceed.
    
    Args:
        owner: GitHub repository owner/organization.
        repo: GitHub repository name.
        
    Returns:
        Dictionary containing metadata fields:
        { owner, name, description, default_branch, language, stars, open_issues_count, clone_url }
    """
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "flux-Phase1",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(api_url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
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
            elif response.status_code == 404:
                raise ValueError(f"Repository '{owner}/{repo}' not found on GitHub (or is private).")
            elif response.status_code == 403:
                # Rate limit exceeded or forbidden; fallback to default metadata
                return {
                    "owner": owner,
                    "name": repo,
                    "description": "Metadata unavailable (GitHub API rate limit)",
                    "default_branch": "main",
                    "language": "Unknown",
                    "stars": 0,
                    "open_issues_count": 0,
                    "clone_url": f"https://github.com/{owner}/{repo}.git",
                }
            else:
                response.raise_for_status()

    except httpx.HTTPError:
        # Fallback to direct Git URL if API is unreachable
        return {
            "owner": owner,
            "name": repo,
            "description": "Directly ingested without GitHub API metadata",
            "default_branch": "main",
            "language": "Unknown",
            "stars": 0,
            "open_issues_count": 0,
            "clone_url": f"https://github.com/{owner}/{repo}.git",
        }
