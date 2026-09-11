"""
Repository Ingestion Service.
Performs shallow cloning using system git, reads documentation (README, CONTRIBUTING),
calculates basic repository metrics, and persists repository data to SQLite.
"""

import os
import shutil
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from config import settings
from models.database import save_repository, get_repository_by_id
from services.github import parse_github_url, fetch_repo_metadata


def _remove_readonly(func, path, _):
    """
    Error handler for Windows shutil.rmtree to clear read-only attributes
    on git files (.git/objects) before removing.
    """
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def clone_repository(clone_url: str, target_dir: Path, force_refresh: bool = False) -> Path:
    """
    Performs a shallow git clone (--depth 1) into the target directory.
    If the directory already exists and contains a git repo, reuses it unless force_refresh is True.
    
    Args:
        clone_url: Git clone URL (HTTPS).
        target_dir: Destination path inside the workspaces/ directory.
        force_refresh: If True, wipes any existing directory and performs a fresh clone.
        
    Returns:
        The target directory Path.
        
    Raises:
        RuntimeError: If the git command fails.
    """
    if target_dir.exists() and (target_dir / ".git").exists():
        if not force_refresh:
            # Reuse already cloned repository for fast demo operation
            return target_dir
        else:
            # Force refresh: clear directory on Windows safely
            shutil.rmtree(target_dir, onerror=_remove_readonly)

    # Ensure parent directory exists (e.g. workspaces/<owner>/)
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    # Execute shallow clone via native git
    cmd = ["git", "clone", "--depth", "1", clone_url, str(target_dir)]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() or e.stdout.strip() or "Git clone failed"
        raise RuntimeError(f"Failed to clone repository: {error_msg}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("Git clone timed out after 120 seconds")

    return target_dir


def _read_file_safely(file_path: Path, max_chars: int = 100_000) -> Optional[str]:
    """
    Reads text content from a file with utf-8 encoding, falling back to latin-1.
    Truncates content to max_chars to keep payload manageable.
    """
    if not file_path.is_file():
        return None
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read(max_chars)
    except Exception:
        try:
            with open(file_path, "r", encoding="latin-1", errors="replace") as f:
                return f.read(max_chars)
        except Exception:
            return None


def read_repo_docs(repo_dir: Path) -> Dict[str, Any]:
    """
    Scans a cloned repository directory for standard documentation files
    (README, CONTRIBUTING) and computes basic workspace statistics.
    
    Returns:
        Dict with keys:
        - readme_content: Optional[str]
        - contributing_content: Optional[str]
        - file_count: int
    """
    readme_content: Optional[str] = None
    contributing_content: Optional[str] = None

    # Common README filenames to search for in repo root
    readme_candidates = [
        "README.md", "readme.md", "Readme.md",
        "README.rst", "README.txt", "README"
    ]
    for candidate in readme_candidates:
        candidate_path = repo_dir / candidate
        if candidate_path.exists():
            readme_content = _read_file_safely(candidate_path)
            if readme_content:
                break

    # Common CONTRIBUTING filenames in root, .github/, and docs/
    contributing_candidates = [
        repo_dir / "CONTRIBUTING.md",
        repo_dir / "contributing.md",
        repo_dir / "Contributing.md",
        repo_dir / ".github" / "CONTRIBUTING.md",
        repo_dir / ".github" / "contributing.md",
        repo_dir / "docs" / "CONTRIBUTING.md",
    ]
    for candidate_path in contributing_candidates:
        if candidate_path.exists():
            contributing_content = _read_file_safely(candidate_path)
            if contributing_content:
                break

    # Calculate file count (excluding .git folder)
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


async def ingest_repository(raw_url: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Coordinates the complete repository ingestion pipeline:
    1. Parse and validate GitHub URL
    2. Fetch repository metadata from GitHub REST API
    3. Shallow clone repository into workspaces/<owner>/<repo>
    4. Read README and CONTRIBUTING documentation
    5. Save repository record in SQLite database
    
    Args:
        raw_url: GitHub URL or owner/repo shorthand.
        force_refresh: Force fresh clone if True.
        
    Returns:
        Complete repository record dictionary.
    """
    owner, repo_name = parse_github_url(raw_url)
    repo_id = f"{owner.lower()}/{repo_name.lower()}"
    canonical_url = f"https://github.com/{owner}/{repo_name}"

    # Target directory under workspaces/<owner>/<repo>
    target_dir = settings.workspaces_dir / owner / repo_name
    relative_clone_path = str(target_dir.relative_to(settings.workspaces_dir.parent))

    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Fetch metadata from GitHub API
    github_meta = await fetch_repo_metadata(owner, repo_name)

    # 2. Clone repository to workspaces/
    clone_repository(github_meta["clone_url"], target_dir, force_refresh=force_refresh)

    # 3. Read documentation files and compute file count
    docs = read_repo_docs(target_dir)

    # 4. Prepare repository record
    existing_record = get_repository_by_id(repo_id)
    created_at = existing_record["created_at"] if existing_record else now_iso

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

    # 5. Persist to SQLite
    save_repository(repo_record)

    return repo_record
