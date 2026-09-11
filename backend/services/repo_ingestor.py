# Repository shallow cloning and documentation ingestion service.

import os
import shutil
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional

from config import settings
from models.database import save_repository, get_repository_by_id
from services.github import parse_github_url, fetch_repo_metadata


# Clears read-only file attributes on Windows before directory removal.
def remove_readonly(func, path, _):
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


# Performs a shallow git clone into the workspaces directory.
def clone_repository(clone_url: str, target_dir: Path, force_refresh: bool = False) -> Path:
    if target_dir.exists() and (target_dir / ".git").exists():
        if not force_refresh:
            return target_dir
        shutil.rmtree(target_dir, onerror=remove_readonly)

    target_dir.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["git", "clone", "--depth", "1", clone_url, str(target_dir)]
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=settings.git_clone_timeout)
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() or e.stdout.strip() or "Git clone failed"
        raise RuntimeError(f"Failed to clone repository: {error_msg}")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Git clone timed out after {settings.git_clone_timeout} seconds")

    return target_dir


# Safely reads file contents up to a maximum character cap.
def read_file_safely(file_path: Path, max_chars: Optional[int] = None) -> Optional[str]:
    if not file_path.is_file():
        return None
    effective_max = max_chars or settings.max_read_chars
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read(effective_max)
    except Exception:
        return None


# Reads README and CONTRIBUTING documentation files and counts workspace files.
def read_repo_docs(repo_dir: Path) -> Dict[str, Any]:
    readme_content: Optional[str] = None
    contributing_content: Optional[str] = None

    for name in ["README.md", "readme.md", "README.rst", "README.txt", "README"]:
        path = repo_dir / name
        if path.exists():
            readme_content = read_file_safely(path)
            if readme_content:
                break

    for candidate in [repo_dir / "CONTRIBUTING.md", repo_dir / "contributing.md", repo_dir / ".github" / "CONTRIBUTING.md"]:
        if candidate.exists():
            contributing_content = read_file_safely(candidate)
            if contributing_content:
                break

    file_count = 0
    for root, dirs, files in os.walk(repo_dir):
        if ".git" in dirs:
            dirs.remove(".git")
        file_count += len(files)

    return {
        "readme_content": readme_content,
        "contributing_content": contributing_content,
        "file_count": file_count,
    }


# Coordinates full repository ingestion, cloning, doc extraction, and database persistence.
async def ingest_repository(raw_url: str, force_refresh: bool = False) -> Dict[str, Any]:
    owner, repo_name = parse_github_url(raw_url)
    repo_id = f"{owner.lower()}/{repo_name.lower()}"
    canonical_url = f"https://github.com/{owner}/{repo_name}"

    target_dir = settings.workspaces_dir / owner / repo_name
    relative_clone_path = str(target_dir.relative_to(settings.workspaces_dir.parent))
    now_iso = datetime.now(timezone.utc).isoformat()

    github_meta = await fetch_repo_metadata(owner, repo_name)
    clone_repository(github_meta["clone_url"], target_dir, force_refresh=force_refresh)
    docs = read_repo_docs(target_dir)

    existing = get_repository_by_id(repo_id)
    created_at = existing["created_at"] if existing else now_iso

    repo_record = {
        "id": repo_id,
        "url": canonical_url,
        "owner": github_meta["owner"],
        "name": github_meta["name"],
        "description": github_meta["description"],
        "default_branch": github_meta["default_branch"],
        "language": github_meta["language"],
        "stars": github_meta["stars"],
        "open_issues_count": github_meta["open_issues_count"],
        "clone_path": relative_clone_path,
        "readme_content": docs["readme_content"],
        "contributing_content": docs["contributing_content"],
        "file_count": docs["file_count"],
        "status": "ready",
        "error_message": None,
        "created_at": created_at,
        "updated_at": now_iso,
    }

    save_repository(repo_record)
    return repo_record
