# Unit and integration tests for issue discovery, label filtering, and graph relevance matching.

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db, save_issues, get_issues_by_repo_id
from models.graph import GraphResponse
from services.issue_relevance import find_relevant_graph_context, format_issue_graph_digest
from services.issue_explainer import generate_issue_explanation


# Verifies issue discovery, label filtering, 1-hop graph relevance matching, and explanation generation.
async def test_issue_discovery_and_explanation():
    init_db()
    repo_id = "testowner/testrepo"

    mock_issues = [
        {
            "number": 1,
            "title": "Fix crash when loading todos from backend API",
            "body": "The frontend crashes when `Todos.tsx` calls `api.py` if the database is empty.",
            "state": "open",
            "author": "bugcatcher",
            "labels_json": json.dumps([{"name": "bug", "color": "d73a4a"}, {"name": "frontend", "color": "38bdf8"}]),
            "comments_count": 2,
            "html_url": "https://github.com/testowner/testrepo/issues/1",
            "created_at": "2026-09-11T10:00:00Z",
            "updated_at": "2026-09-11T10:00:00Z",
        },
        {
            "number": 2,
            "title": "Add dark mode toggle to header",
            "body": "Users need a dark mode switch in `Header.tsx`.",
            "state": "open",
            "author": "designfan",
            "labels_json": json.dumps([{"name": "enhancement", "color": "a2eeef"}]),
            "comments_count": 0,
            "html_url": "https://github.com/testowner/testrepo/issues/2",
            "created_at": "2026-09-11T11:00:00Z",
            "updated_at": "2026-09-11T11:00:00Z",
        }
    ]

    save_issues(repo_id, mock_issues)
    all_issues = get_issues_by_repo_id(repo_id)
    assert len(all_issues) == 2

    bug_issues = get_issues_by_repo_id(repo_id, label_filter="bug")
    assert len(bug_issues) == 1
    assert bug_issues[0]["issue_number"] == 1

    mock_graph = GraphResponse(
        repo_id=repo_id,
        metrics={
            "total_nodes": 3,
            "total_edges": 1,
            "density": 0.33,
            "top_central_files": [{"file": "backend/api.py", "score": 0.8, "in_degree": 1, "out_degree": 1}],
            "clusters_count": 1,
        },
        nodes=[
            {
                "id": "backend/api.py",
                "label": "api.py",
                "node_type": "file",
                "language": "python",
                "line_count": 40,
                "symbols": [{"name": "get_todos", "type": "function", "start_line": 10, "end_line": 20}],
                "in_degree": 1,
                "out_degree": 0,
                "centrality": 0.8,
                "cluster": 0,
            },
            {
                "id": "frontend/src/components/Todos.tsx",
                "label": "Todos.tsx",
                "node_type": "file",
                "language": "typescript",
                "line_count": 60,
                "symbols": [{"name": "Todos", "type": "function", "start_line": 5, "end_line": 50}],
                "in_degree": 1,
                "out_degree": 1,
                "centrality": 0.5,
                "cluster": 0,
            },
        ],
        edges=[{"source": "frontend/src/components/Todos.tsx", "target": "backend/api.py", "type": "imports"}],
        updated_at="2026-09-11T10:00:00Z",
    )

    contexts = find_relevant_graph_context(
        issue_title=mock_issues[0]["title"],
        issue_body=mock_issues[0]["body"],
        graph=mock_graph,
    )
    assert len(contexts) >= 1
    digest = format_issue_graph_digest(contexts)
    assert "Relevant 1-Hop Codebase Neighborhood" in digest

    explanation = await generate_issue_explanation(
        issue_data=mock_issues[0],
        graph_contexts=contexts,
        repo_id=repo_id,
        issue_number=1,
    )
    assert explanation.issue_number == 1
    assert len(explanation.plain_english_summary) > 10

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})
        res = await client.get("/api/repos/octocat/Hello-World/issues")
        assert res.status_code == 200
        assert "issues" in res.json()


if __name__ == "__main__":
    asyncio.run(test_issue_discovery_and_explanation())
