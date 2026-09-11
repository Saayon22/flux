"""
FastAPI Router for Dependency Graph endpoints.
Handles building and retrieving AST-grounded dependency graphs and metrics.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, status

from config import settings
from models.database import (
    get_repository_by_id,
    save_graph,
    get_graph_by_repo_id,
)
from models.graph import GraphResponse
from services.parser import parse_repository
from services.graph import build_repository_graph

router = APIRouter(prefix="/api/repos", tags=["graph"])


@router.post("/{owner}/{repo}/graph/build", response_model=GraphResponse)
async def build_graph_endpoint(owner: str, repo: str):
    """
    Parses source code files in the cloned repository workspace using Tree-sitter,
    constructs a NetworkX directed dependency graph, calculates metrics,
    persists the graph in SQLite, and returns the graph data.
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{owner}/{repo}' has not been ingested yet. Please ingest it first."
        )

    # Path to local cloned workspace
    target_dir = settings.workspaces_dir / repo_record["owner"] / repo_record["name"]
    if not target_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Local workspace directory '{target_dir}' does not exist."
        )

    # 1. Parse repository files with Tree-sitter
    parse_results = parse_repository(target_dir)

    now_iso = datetime.now(timezone.utc).isoformat()

    # 2. Build NetworkX graph & compute metrics
    graph_response = build_repository_graph(parse_results, repo_id, now_iso)

    # 3. Persist to SQLite
    save_graph(
        repo_id=repo_id,
        nodes_count=graph_response.metrics.total_nodes,
        edges_count=graph_response.metrics.total_edges,
        metrics_json=graph_response.metrics.model_dump_json(),
        graph_json=graph_response.model_dump_json(),
        now_iso=now_iso,
    )

    return graph_response


@router.get("/{owner}/{repo}/graph", response_model=GraphResponse)
async def get_graph_endpoint(owner: str, repo: str):
    """
    Retrieves the cached dependency graph and metrics for an ingested repository.
    """
    repo_id = f"{owner.lower()}/{repo.lower()}"
    record = get_graph_by_repo_id(repo_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dependency graph has not been built yet for '{owner}/{repo}'. Please click 'Build Dependency Graph'."
        )

    raw_json = json.loads(record["graph_json"])
    return GraphResponse(**raw_json)
