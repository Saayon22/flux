"""
Automated verification script for Phase 1 (Repository Ingestion).
Tests URL parsing, shallow cloning, documentation extraction, and SQLite persistence.
"""

import asyncio
import os
import sys
from pathlib import Path

# Ensure backend directory is in python search path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import settings
from models.database import init_db, get_repository_by_id, list_repositories
from services.github import parse_github_url
from services.repo_ingestor import ingest_repository


def test_url_parsing():
    """Verify that URL parsing handles various valid GitHub formats and rejects invalid ones."""
    test_cases = [
        ("https://github.com/octocat/Hello-World", ("octocat", "Hello-World")),
        ("https://github.com/octocat/Hello-World.git", ("octocat", "Hello-World")),
        ("http://github.com/octocat/Hello-World/", ("octocat", "Hello-World")),
        ("git@github.com:octocat/Hello-World.git", ("octocat", "Hello-World")),
        ("octocat/Hello-World", ("octocat", "Hello-World")),
    ]
    for raw_url, expected in test_cases:
        owner, repo = parse_github_url(raw_url)
        assert (owner, repo) == expected, f"Failed for {raw_url}: got {(owner, repo)}, expected {expected}"
    print("[PASS] URL parsing test passed for all valid formats")

    # Invalid URL test
    try:
        parse_github_url("not-a-valid-github-url")
        assert False, "Should have raised ValueError for invalid URL"
    except ValueError:
        print("[PASS] Invalid URL properly rejected")


async def test_end_to_end_ingestion():
    """Verify shallow clone, doc extraction, and database persistence on a real public repo."""
    init_db()

    target_url = "https://github.com/octocat/Hello-World"
    print(f"Testing ingestion for: {target_url}...")

    repo_record = await ingest_repository(target_url, force_refresh=False)
    
    assert repo_record["id"] == "octocat/hello-world"
    assert repo_record["owner"] == "octocat"
    assert repo_record["name"] == "Hello-World"
    assert repo_record["status"] == "ready"
    assert repo_record["file_count"] >= 1
    assert repo_record["readme_content"] is not None
    assert len(repo_record["readme_content"]) > 0

    # Verify directory on filesystem
    cloned_dir = settings.workspaces_dir / "octocat" / "Hello-World"
    assert cloned_dir.exists(), f"Directory {cloned_dir} does not exist"
    assert (cloned_dir / ".git").exists(), "Cloned repository missing .git directory"

    # Verify database fetch
    fetched = get_repository_by_id("octocat/hello-world")
    assert fetched is not None, "Failed to fetch repository from SQLite"
    assert fetched["id"] == "octocat/hello-world"

    # Verify list repositories
    all_repos = list_repositories()
    assert any(r["id"] == "octocat/hello-world" for r in all_repos), "Repo missing from list_repositories"

    print("[PASS] Cloned successfully to:", cloned_dir)
    print("[PASS] File count:", repo_record["file_count"])
    print("[PASS] README length:", len(repo_record["readme_content"]))
    print("[PASS] Database persistence verified")
    print("[PASS] Phase 1 End-to-End Ingestion test passed!")


if __name__ == "__main__":
    print("--- Running Phase 1 Tests ---")
    test_url_parsing()
    asyncio.run(test_end_to_end_ingestion())
    print("--- All Phase 1 Tests Passed Successfully! ---")
