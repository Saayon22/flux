"""
Pydantic data schemas for AST parsing, code symbols, and NetworkX dependency graphs.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class CodeSymbol(BaseModel):
    """
    Extracted code symbol (function, method, class) from AST parsing.
    """
    name: str = Field(..., description="Symbol name (function or class name)")
    type: str = Field(..., description="Symbol type: 'function', 'class', or 'method'")
    start_line: int = Field(..., description="1-indexed starting line in source file")
    end_line: int = Field(..., description="1-indexed ending line in source file")
    docstring: Optional[str] = Field(default=None, description="Optional symbol docstring or documentation")


class FileParseResult(BaseModel):
    """
    Structured extraction result for an individual source code file parsed via Tree-sitter.
    """
    file_path: str = Field(..., description="Relative workspace path of the parsed file")
    language: str = Field(..., description="Programming language: 'python', 'javascript', 'typescript'")
    imports: List[str] = Field(default_factory=list, description="List of imported modules or relative paths")
    symbols: List[CodeSymbol] = Field(default_factory=list, description="Functions and classes defined in file")
    line_count: int = Field(default=0, description="Total number of lines in file")


class GraphNode(BaseModel):
    """
    Node representing a source file within the dependency graph.
    """
    id: str = Field(..., description="Unique node identifier (relative file path)")
    label: str = Field(..., description="Display label for the node (usually file name)")
    node_type: str = Field(default="file", description="Node category: 'file'")
    language: str = Field(..., description="Language of the file")
    line_count: int = Field(default=0, description="Total lines of code")
    symbols: List[CodeSymbol] = Field(default_factory=list, description="Extracted symbols")
    in_degree: int = Field(default=0, description="Number of files that import this file")
    out_degree: int = Field(default=0, description="Number of files this file imports")
    centrality: float = Field(default=0.0, description="Computed degree centrality score")
    cluster: int = Field(default=0, description="Functional cluster / community group index")


class GraphEdge(BaseModel):
    """
    Directed edge representing an import relationship between two source files.
    """
    source: str = Field(..., description="Source file node ID that executes the import")
    target: str = Field(..., description="Target file node ID being imported")
    type: str = Field(default="imports", description="Relationship type: 'imports'")


class TopCentralFile(BaseModel):
    """
    Summary item for high-centrality files identified in the repository architecture.
    """
    file: str
    score: float
    in_degree: int
    out_degree: int


class GraphMetrics(BaseModel):
    """
    Aggregated structural and architectural metrics computed by NetworkX.
    """
    total_nodes: int = Field(default=0, description="Total number of source files in graph")
    total_edges: int = Field(default=0, description="Total number of import dependencies")
    density: float = Field(default=0.0, description="Graph density (edges / max possible edges)")
    top_central_files: List[TopCentralFile] = Field(default_factory=list, description="Top central files")
    clusters_count: int = Field(default=0, description="Number of connected clusters identified")


class GraphResponse(BaseModel):
    """
    Full API response payload returning graph metrics, nodes, and edges.
    """
    repo_id: str
    metrics: GraphMetrics
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    updated_at: str
