"""
Pydantic data schemas for repository requests, responses, and serialization.
"""

from typing import Optional
from pydantic import BaseModel, Field


class RepoIngestRequest(BaseModel):
    """
    Request body for ingesting a GitHub repository.
    Accepts full URL (https://github.com/owner/repo) or shorthand (owner/repo).
    """
    url: str = Field(..., description="GitHub repository URL or owner/repo shorthand")
    force_refresh: bool = Field(
        default=False,
        description="If True, re-clones the repo even if already present locally"
    )


class RepoSummary(BaseModel):
    """
    Basic repository metadata summary.
    """
    id: str
    url: str
    owner: str
    name: str
    description: Optional[str] = None
    default_branch: str = "main"
    language: Optional[str] = None
    stars: int = 0
    open_issues_count: int = 0
    clone_path: str
    file_count: int = 0
    status: str
    error_message: Optional[str] = None
    has_readme: bool = False
    has_contributing: bool = False
    created_at: str
    updated_at: str


class RepoDetailResponse(RepoSummary):
    """
    Detailed repository view including raw markdown documentation contents.
    """
    readme_content: Optional[str] = None
    contributing_content: Optional[str] = None


class RepoIngestResponse(BaseModel):
    """
    Response returned immediately after repository ingestion process finishes.
    """
    success: bool
    message: str
    repository: Optional[RepoDetailResponse] = None
