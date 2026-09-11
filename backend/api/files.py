# FastAPI Router for safe repository file content inspection and code preview.

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from config import settings
from models.database import get_repository_by_id

router = APIRouter(prefix="/api/repos", tags=["files"])

MAX_PREVIEW_LINES = settings.max_preview_lines
MAX_PREVIEW_BYTES = settings.max_preview_bytes


# Response schema for file inspection preview.
class FileContentResponse(BaseModel):
    path: str
    language: str
    line_count: int
    content: str
    is_truncated: bool = False
    error: Optional[str] = None


# Infers syntax highlighting language from file extension.
def detect_language(file_path: Path) -> str:
    mapping = {
        ".py": "python", ".js": "javascript", ".jsx": "javascript",
        ".ts": "typescript", ".tsx": "typescript", ".json": "json",
        ".md": "markdown", ".html": "html", ".css": "css",
        ".sql": "sql", ".sh": "bash", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    }
    return mapping.get(file_path.suffix.lower(), "plaintext")


# Safely reads and returns the text content of a workspace file with traversal checks.
@router.get("/{owner}/{repo}/files/content", response_model=FileContentResponse)
async def get_file_content_endpoint(
    owner: str,
    repo: str,
    path: str = Query(..., description="Relative path of file inside workspace"),
):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Repository '{owner}/{repo}' not ingested.")

    repo_dir = (settings.workspaces_dir / repo_record["owner"] / repo_record["name"]).resolve()
    if not repo_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace directory not found.")

    clean_rel = path.strip().replace("\\", "/").lstrip("/")
    target_file = (repo_dir / clean_rel).resolve()

    # Security verification to prevent directory traversal
    try:
        if not target_file.is_relative_to(repo_dir):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: file outside workspace.")
    except AttributeError:
        if not str(target_file).startswith(str(repo_dir)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: file outside workspace.")

    if not target_file.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{clean_rel}' not found.")
    if not target_file.is_file():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Path '{clean_rel}' is a directory.")

    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            lines = []
            total_bytes = 0
            is_truncated = False
            total_lines = 0

            for line in f:
                total_lines += 1
                if len(lines) < MAX_PREVIEW_LINES and total_bytes < MAX_PREVIEW_BYTES:
                    lines.append(line)
                    total_bytes += len(line.encode("utf-8", errors="ignore"))
                else:
                    is_truncated = True

            content = "".join(lines)
            if is_truncated:
                content += f"\n\n# --- Truncated for performance (Showing {len(lines)} of {total_lines} lines) ---"

            return FileContentResponse(
                path=clean_rel,
                language=detect_language(target_file),
                line_count=total_lines,
                content=content,
                is_truncated=is_truncated,
            )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to read file: {e}")
