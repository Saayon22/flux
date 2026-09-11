# Unit and integration tests for repository URL parsing, shallow cloning, and ingestion.

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import settings
from models.database import init_db, get_repository_by_id, list_repositories
from services.github import parse_github_url
from services.repo_ingestor import ingest_repository


# Verifies parsing of various GitHub URL formats and rejection of invalid ones.
def test_url_parsing():
    test_cases = [
        ("https://github.com/octocat/Hello-World", ("octocat", "Hello-World")),
        ("https://github.com/octocat/Hello-World.git", ("octocat", "Hello-World")),
        ("http://github.com/octocat/Hello-World/", ("octocat", "Hello-World")),
        ("git@github.com:octocat/Hello-World.git", ("octocat", "Hello-World")),
        ("octocat/Hello-World", ("octocat", "Hello-World")),
    ]
    for raw_url, expected in test_cases:
        assert parse_github_url(raw_url) == expected

    try:
        parse_github_url("not-a-valid-github-url")
        assert False
    except ValueError:
        pass


# Verifies end-to-end repository shallow clone, doc extraction, and database persistence.
async def test_end_to_end_ingestion():
    init_db()
    target_url = "https://github.com/octocat/Hello-World"
    repo_record = await ingest_repository(target_url, force_refresh=False)

    assert repo_record["id"] == "octocat/hello-world"
    assert repo_record["owner"] == "octocat"
    assert repo_record["name"] == "Hello-World"
    assert repo_record["status"] == "ready"

    cloned_dir = settings.workspaces_dir / "octocat" / "Hello-World"
    assert cloned_dir.exists()
    assert (cloned_dir / ".git").exists()

    fetched = get_repository_by_id("octocat/hello-world")
    assert fetched is not None
    assert any(r["id"] == "octocat/hello-world" for r in list_repositories())


if __name__ == "__main__":
    test_url_parsing()
    asyncio.run(test_end_to_end_ingestion())
