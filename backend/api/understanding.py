# FastAPI Router for plain-English repository understanding and architecture summary endpoints.

import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status

from config import settings
from models.database import (
    get_repository_by_id,
    get_graph_by_repo_id,
    save_graph,
    save_understanding,
    get_understanding_by_repo_id,
)
from models.graph import GraphResponse
from models.understanding import FeatureItem, ArchitectureFlow, RepoUnderstanding
from services.parser import parse_repository
from services.graph import build_repository_graph
from services.digest import build_repository_digest
from services.llm import generate_repository_understanding

router = APIRouter(prefix="/api/repos", tags=["understanding"])


# Generates and caches plain-English repository understanding from digest context.
@router.post("/{owner}/{repo}/understand", response_model=RepoUnderstanding)
async def generate_understanding_endpoint(owner: str, repo: str):
    repo_id = f"{owner.lower()}/{repo.lower()}"
    repo_record = get_repository_by_id(repo_id)
    if not repo_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Repository '{owner}/{repo}' not ingested.")

    graph_record = get_graph_by_repo_id(repo_id)
    if graph_record:
        graph_response = GraphResponse(**json.loads(graph_record["graph_json"]))
    else:
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

    digest = build_repository_digest(repo_record, graph_response)
    understanding = await generate_repository_understanding(repo_record, digest, repo_id)

    save_understanding(
        repo_id=repo_id,
        overview=understanding.overview,
        architecture_summary=understanding.architecture_summary,
        feature_map_json=json.dumps([f.model_dump() for f in understanding.feature_map]),
        flows_json=json.dumps([fl.model_dump() for fl in understanding.flows]),
        digest_text=digest,
        model_used=understanding.model_used,
        is_fallback=understanding.is_fallback,
        now_iso=understanding.created_at,
    )
    return understanding


# Retrieves cached plain-English repository understanding from SQLite.
@router.get("/{owner}/{repo}/understand", response_model=RepoUnderstanding)
async def get_understanding_endpoint(owner: str, repo: str):
    record = get_understanding_by_repo_id(f"{owner.lower()}/{repo.lower()}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Understanding not generated for '{owner}/{repo}'.")

    return RepoUnderstanding(
        repo_id=record["repo_id"],
        overview=record["overview"],
        architecture_summary=record["architecture_summary"],
        feature_map=[FeatureItem(**item) for item in json.loads(record["feature_map_json"])],
        flows=[ArchitectureFlow(**item) for item in json.loads(record["flows_json"])],
        model_used=record["model_used"],
        is_fallback=bool(record["is_fallback"]),
        digest=record["digest_text"],
        created_at=record["created_at"],
    )
