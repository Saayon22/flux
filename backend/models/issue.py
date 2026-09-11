# Pydantic models for GitHub Issues and Grounded Issue Explanations.

from typing import List, Optional
from pydantic import BaseModel, Field


# GitHub issue label representation with display color.
class IssueLabel(BaseModel):
    name: str
    color: str = "71717a"
    description: Optional[str] = None


# Structured summary of a GitHub issue.
class IssueSummary(BaseModel):
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


# File and functions relevant to resolving a specific issue.
class RelevantFileItem(BaseModel):
    file: str
    reason: str
    symbols_to_inspect: List[str] = Field(default_factory=list)


# Plain-English grounded issue explanation and task checklist.
class IssueExplanation(BaseModel):
    issue_id: str
    repo_id: str
    issue_number: int
    plain_english_summary: str
    real_world_analogy: str
    relevant_files: List[RelevantFileItem] = Field(default_factory=list)
    implementation_steps: List[str] = Field(default_factory=list)
    estimated_complexity: str = "Medium"
    model_used: str
    is_fallback: bool = False
    created_at: str


# Response schema containing list of issues and available filter labels.
class IssueListResponse(BaseModel):
    repo_id: str
    total_count: int
    available_labels: List[IssueLabel]
    issues: List[IssueSummary]
