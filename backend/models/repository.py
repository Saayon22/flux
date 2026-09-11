# Pydantic data schemas for repository requests, responses, and serialization.

from typing import Optional
from pydantic import BaseModel, Field


# Request payload schema for ingesting a repository.
class RepoIngestRequest(BaseModel):
    url: str = Field(..., description="GitHub repository URL or owner/repo shorthand")
    force_refresh: bool = Field(default=False, description="If True, re-clones the repository")


# Summary schema of repository metadata.
class RepoSummary(BaseModel):
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


# Detailed repository schema including markdown documentation contents.
class RepoDetailResponse(RepoSummary):
    readme_content: Optional[str] = None
    contributing_content: Optional[str] = None


# Response payload schema for repository ingestion completion.
class RepoIngestResponse(BaseModel):
    success: bool
    message: str
    repository: Optional[RepoDetailResponse] = None
