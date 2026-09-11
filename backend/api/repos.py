# FastAPI Router for repository ingestion and retrieval endpoints.

from typing import List
from fastapi import APIRouter, HTTPException, status

from models.database import get_repository_by_id, list_repositories
from models.repository import (
    RepoIngestRequest,
    RepoIngestResponse,
    RepoDetailResponse,
    RepoSummary,
)
from services.repo_ingestor import ingest_repository

router = APIRouter(prefix="/api/repos", tags=["repositories"])


# Formats database dictionary into RepoDetailResponse schema.
def format_repo_detail(record: dict) -> RepoDetailResponse:
    return RepoDetailResponse(
        id=record["id"],
        url=record["url"],
        owner=record["owner"],
        name=record["name"],
        description=record["description"],
        default_branch=record["default_branch"],
        language=record["language"],
        stars=record["stars"],
        open_issues_count=record["open_issues_count"],
        clone_path=record["clone_path"],
        file_count=record["file_count"],
        status=record["status"],
        error_message=record["error_message"],
        has_readme=bool(record["readme_content"]),
        has_contributing=bool(record["contributing_content"]),
        readme_content=record["readme_content"],
        contributing_content=record["contributing_content"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


# Formats database dictionary into lightweight RepoSummary schema.
def format_repo_summary(record: dict) -> RepoSummary:
    return RepoSummary(
        id=record["id"],
        url=record["url"],
        owner=record["owner"],
        name=record["name"],
        description=record["description"],
        default_branch=record["default_branch"],
        language=record["language"],
        stars=record["stars"],
        open_issues_count=record["open_issues_count"],
        clone_path=record["clone_path"],
        file_count=record["file_count"],
        status=record["status"],
        error_message=record["error_message"],
        has_readme=bool(record["readme_content"]),
        has_contributing=bool(record["contributing_content"]),
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


# Ingests a repository, clones workspace, reads documentation, and saves record.
@router.post("/ingest", response_model=RepoIngestResponse, status_code=status.HTTP_200_OK)
async def ingest_repo_endpoint(request: RepoIngestRequest):
    try:
        repo_data = await ingest_repository(request.url, force_refresh=request.force_refresh)
        detail = format_repo_detail(repo_data)
        return RepoIngestResponse(success=True, message=f"Successfully ingested {detail.owner}/{detail.name}", repository=detail)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# Retrieves stored repository details by owner and repository name.
@router.get("/{owner}/{repo}", response_model=RepoDetailResponse)
async def get_repo_endpoint(owner: str, repo: str):
    record = get_repository_by_id(f"{owner.lower()}/{repo.lower()}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Repository '{owner}/{repo}' not found.")
    return format_repo_detail(record)


# Lists recently ingested repositories.
@router.get("", response_model=List[RepoSummary])
async def list_repos_endpoint(limit: int = 20):
    return [format_repo_summary(r) for r in list_repositories(limit=limit)]
