"""
Pydantic models for GitHub Issues and Grounded Issue Explanations.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class IssueLabel(BaseModel):
    """GitHub issue label representation with display color."""
    name: str
    color: str = "71717a"
    description: Optional[str] = None


class IssueSummary(BaseModel):
    """Structured summary of an open GitHub issue."""
    id: str
    number: int
    title: str
    body: Optional[str] = ""
    state: str = "open"
    author: str = ""
    labels: List[IssueLabel] = []
    comments_count: int = 0
    html_url: str
    created_at: str


class RelevantFileItem(BaseModel):
    """File and functions relevant to resolving a specific issue."""
    file: str
    reason: str
    symbols_to_inspect: List[str] = Field(default_factory=list)


class IssueExplanation(BaseModel):
    """Plain-English grounded issue explanation and task checklist."""
    issue_id: str
    repo_id: str
    issue_number: int
    plain_english_summary: str
    real_world_analogy: str
    relevant_files: List[RelevantFileItem] = Field(default_factory=list)
    implementation_steps: List[str] = Field(default_factory=list)
    estimated_complexity: str = "Medium"  # "Low" | "Medium" | "High"
    model_used: str
    is_fallback: bool = False
    created_at: str


class IssueListResponse(BaseModel):
    """Response containing list of issues and available filter labels for a repository."""
    repo_id: str
    total_count: int
    available_labels: List[IssueLabel]
    issues: List[IssueSummary]
