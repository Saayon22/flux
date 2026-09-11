# FastAPI Router for AST dependency graph building and retrieval endpoints.

import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status

from config import settings
from models.database import get_repository_by_id, save_graph, get_graph_by_repo_id
from models.graph import GraphResponse
from services.parser import parse_repository
from services.graph import build_repository_graph

router = APIRouter(prefix="/api/repos", tags=["graph"])


# Parses workspace source code with Tree-sitter, constructs NetworkX graph, and saves to database.
@router.post("/{owner}/{repo}/graph/build", response_model=GraphResponse)
async def build_graph_endpoint(owner: str, repo: str):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Repository '{owner}/{repo}' not ingested.")

    target_dir = settings.workspaces_dir / repo_record["owner"] / repo_record["name"]
    if not target_dir.exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace directory not found.")

    parse_results = parse_repository(target_dir)
    now_iso = datetime.now(timezone.utc).isoformat()
    graph_response = build_repository_graph(parse_results, repo_id, now_iso)

    save_graph(
        repo_id=repo_id,
        nodes_count=graph_response.metrics.total_nodes,
        edges_count=graph_response.metrics.total_edges,
        metrics_json=graph_response.metrics.model_dump_json(),
        graph_json=graph_response.model_dump_json(),
        now_iso=now_iso,
    )
    return graph_response


# Retrieves the cached dependency graph for an ingested repository.
@router.get("/{owner}/{repo}/graph", response_model=GraphResponse)
async def get_graph_endpoint(owner: str, repo: str):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    record = get_graph_by_repo_id(repo_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dependency graph not found for '{owner}/{repo}'.")
    return GraphResponse(**json.loads(record["graph_json"]))
