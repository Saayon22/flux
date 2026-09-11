# Pydantic data schemas for AST parsing, code symbols, and NetworkX dependency graphs.

from typing import List, Optional
from pydantic import BaseModel, Field


# Extracted code symbol representation from AST parsing.
class CodeSymbol(BaseModel):
    name: str = Field(..., description="Symbol name")
    type: str = Field(..., description="Symbol type: function, class, method, interface")
    start_line: int = Field(..., description="1-indexed starting line")
    end_line: int = Field(..., description="1-indexed ending line")
    docstring: Optional[str] = Field(default=None, description="Symbol docstring")


# Structured extraction result for an individual source code file parsed via Tree-sitter.
class FileParseResult(BaseModel):
    file_path: str = Field(..., description="Relative workspace path")
    language: str = Field(..., description="Programming language")
    imports: List[str] = Field(default_factory=list, description="Imported modules or paths")
    symbols: List[CodeSymbol] = Field(default_factory=list, description="Defined symbols")
    line_count: int = Field(default=0, description="Total line count")


# Node representing a source file within the dependency graph.
class GraphNode(BaseModel):
    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Display label")
    node_type: str = Field(default="file", description="Node category")
    language: str = Field(..., description="File language")
    line_count: int = Field(default=0, description="Total lines of code")
    symbols: List[CodeSymbol] = Field(default_factory=list, description="Extracted symbols")
    in_degree: int = Field(default=0, description="Inbound dependency count")
    out_degree: int = Field(default=0, description="Outbound dependency count")
    centrality: float = Field(default=0.0, description="Degree centrality score")
    cluster: int = Field(default=0, description="Community cluster index")


# Directed edge representing an import relationship between two source files.
class GraphEdge(BaseModel):
    source: str = Field(..., description="Source file node ID that executes the import")
    target: str = Field(..., description="Target file node ID being imported")
    type: str = Field(default="imports", description="Relationship type")


# Summary item for high-centrality files identified in the repository architecture.
class TopCentralFile(BaseModel):
    file: str
    score: float
    in_degree: int
    out_degree: int


# Aggregated structural and architectural metrics computed by NetworkX.
class GraphMetrics(BaseModel):
    total_nodes: int = Field(default=0, description="Total source files in graph")
    total_edges: int = Field(default=0, description="Total import dependencies")
    density: float = Field(default=0.0, description="Graph density")
    top_central_files: List[TopCentralFile] = Field(default_factory=list, description="Top central hub files")
    clusters_count: int = Field(default=0, description="Number of connected clusters")


# Full API response payload returning graph metrics, nodes, and edges.
class GraphResponse(BaseModel):
    repo_id: str
    metrics: GraphMetrics
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    updated_at: str
