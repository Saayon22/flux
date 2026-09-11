"""
Pydantic data schemas for repository understanding, feature mapping, and architecture summaries.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class FeatureItem(BaseModel):
    """
    Individual feature or capability provided by the repository, mapped to implementing files.
    """
    name: str = Field(..., description="Feature title or capability name")
    description: str = Field(..., description="Plain-English explanation of the feature")
    files: List[str] = Field(default_factory=list, description="Source files implementing this feature")


class ArchitectureFlow(BaseModel):
    """
    Structural component in the repository architecture and its connections to other modules.
    """
    component: str = Field(..., description="Architectural module name (e.g. API Layer, Data Store)")
    role: str = Field(..., description="Responsibility and purpose of this component")
    central_file: str = Field(..., description="Primary file / entrypoint for this component")
    connections: List[str] = Field(default_factory=list, description="Target components or files it interacts with")


class RepoUnderstanding(BaseModel):
    """
    Complete plain-English understanding of a repository generated from graph digest & documentation.
    """
    repo_id: str = Field(..., description="Repository identifier ('owner/repo')")
    overview: str = Field(..., description="Comprehensive plain-English overview of repository purpose and tech stack")
    architecture_summary: str = Field(..., description="Explanation of how components interact and how data flows")
    feature_map: List[FeatureItem] = Field(default_factory=list, description="Key features mapped to files")
    flows: List[ArchitectureFlow] = Field(default_factory=list, description="Architectural component connections")
    model_used: str = Field(..., description="Model identifier used for generation")
    is_fallback: bool = Field(default=False, description="True if generated via deterministic fallback")
    digest: Optional[str] = Field(default=None, description="Optional compact prompt digest for transparency")
    created_at: str = Field(..., description="ISO creation timestamp")
