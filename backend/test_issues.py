"""
Integration and Unit Tests for Phase 5 — Issue Discovery & Explanation.
Verifies issue fetching, label filtering, graph relevance matching,
structured LLM explanation with real-world analogy, and FastAPI REST endpoints.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db, save_issues, get_issues_by_repo_id, get_graph_by_repo_id
from models.graph import GraphResponse
from services.issue_relevance import find_relevant_graph_context, format_issue_graph_digest
from services.issue_explainer import generate_issue_explanation


async def test_issue_discovery_and_explanation():
    print("--- Running Phase 5 Tests ---")
    init_db()

    repo_id = "testowner/testrepo"

    # 1. Test database persistence and label filtering for issues
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
            "labels_json": json.dumps([{"name": "enhancement", "color": "a2eeef"}, {"name": "good first issue", "color": "7057ff"}]),
            "comments_count": 0,
            "html_url": "https://github.com/testowner/testrepo/issues/2",
            "created_at": "2026-09-11T11:00:00Z",
            "updated_at": "2026-09-11T11:00:00Z",
        }
    ]

    save_issues(repo_id, mock_issues)
    all_issues = get_issues_by_repo_id(repo_id)
    assert len(all_issues) == 2, f"Expected 2 issues, got {len(all_issues)}"
    print("[PASS] SQLite issue saving and retrieval verified")

    # Test label filtering
    bug_issues = get_issues_by_repo_id(repo_id, label_filter="bug")
    assert len(bug_issues) == 1
    assert bug_issues[0]["issue_number"] == 1
    print("[PASS] Issue label filtering verified")

    # 2. Test Grounded Graph Relevance Matching
    # Build a mock graph with nodes and edges
    mock_graph = GraphResponse(
        repo_id=repo_id,
        metrics={
            "total_nodes": 3,
            "total_edges": 2,
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
            {
                "id": "frontend/src/components/Header.tsx",
                "label": "Header.tsx",
                "node_type": "file",
                "language": "typescript",
                "line_count": 30,
                "symbols": [{"name": "Header", "type": "function", "start_line": 1, "end_line": 25}],
                "in_degree": 1,
                "out_degree": 0,
                "centrality": 0.3,
                "cluster": 0,
            },
        ],
        edges=[
            {"source": "frontend/src/components/Todos.tsx", "target": "backend/api.py", "type": "import"},
        ],
        updated_at="2026-09-11T10:00:00Z"
    )

    contexts = find_relevant_graph_context(
        issue_title=mock_issues[0]["title"],
        issue_body=mock_issues[0]["body"],
        graph=mock_graph,
    )

    assert len(contexts) >= 1, "Should find at least 1 relevant node"
    matched_ids = [c.node_id for c in contexts]
    assert "backend/api.py" in matched_ids or "frontend/src/components/Todos.tsx" in matched_ids
    print(f"[PASS] 1-Hop Graph relevance matching verified (matched: {matched_ids})")

    digest = format_issue_graph_digest(contexts)
    assert "Relevant 1-Hop Codebase Neighborhood" in digest
    print("[PASS] Issue graph neighborhood digest formatted")

    # 3. Test Structured LLM Issue Explanation
    explanation = await generate_issue_explanation(
        issue_data=mock_issues[0],
        graph_contexts=contexts,
        repo_id=repo_id,
        issue_number=1,
    )

    assert explanation.issue_number == 1
    assert len(explanation.plain_english_summary) > 20
    assert len(explanation.real_world_analogy) > 20
    assert len(explanation.implementation_steps) >= 1
    assert len(explanation.relevant_files) >= 1
    assert explanation.estimated_complexity in ("Low", "Medium", "High")
    print(f"[PASS] Issue explanation generated (Model: {explanation.model_used}, Fallback: {explanation.is_fallback})")

    # 4. Test FastAPI Issue Endpoints
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # First ensure octocat/Hello-World is ingested
        await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})

        # GET /api/repos/octocat/Hello-World/issues
        res = await client.get("/api/repos/octocat/Hello-World/issues")
        assert res.status_code == 200, f"GET issues failed: {res.text}"
        data = res.json()
        assert "issues" in data
        assert "available_labels" in data
        print(f"[PASS] GET /api/repos/.../issues returned 200 OK ({len(data['issues'])} issues)")

    print("--- All Phase 5 Tests Passed Successfully! ---")


if __name__ == "__main__":
    asyncio.run(test_issue_discovery_and_explanation())
