# Pydantic data schemas for repository understanding, feature mapping, and architecture summaries.

from typing import List, Optional
from pydantic import BaseModel, Field


# Feature capability representation mapped to implementing files.
class FeatureItem(BaseModel):
    name: str = Field(..., description="Feature title")
    description: str = Field(..., description="Plain-English explanation")
    files: List[str] = Field(default_factory=list, description="Implementing files")


# Structural component in the repository architecture.
class ArchitectureFlow(BaseModel):
    component: str = Field(..., description="Component name")
    role: str = Field(..., description="Responsibility and purpose")
    central_file: str = Field(..., description="Primary entrypoint file")
    connections: List[str] = Field(default_factory=list, description="Target interactions")


# Plain-English understanding of a repository generated from graph digest.
class RepoUnderstanding(BaseModel):
    repo_id: str = Field(..., description="Repository identifier")
    overview: str = Field(..., description="Plain-English overview")
    architecture_summary: str = Field(..., description="Architecture and data flow explanation")
    feature_map: List[FeatureItem] = Field(default_factory=list, description="Key features mapped to files")
    flows: List[ArchitectureFlow] = Field(default_factory=list, description="Architectural flows")
    model_used: str = Field(..., description="Model identifier used")
    is_fallback: bool = Field(default=False, description="Whether generated via fallback")
    digest: Optional[str] = Field(default=None, description="Prompt digest string")
    created_at: str = Field(..., description="ISO creation timestamp")
