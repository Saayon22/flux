# Unit and integration tests for backend ingestion, parsing, graph, issues, and understanding services.

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from models.graph import GraphNode, GraphEdge, GraphMetrics, GraphResponse, CodeSymbol
from models.issue import IssueSummary, IssueLabel, IssueExplanation, RelevantFileItem
from models.understanding import RepoUnderstanding, FeatureItem, ArchitectureFlow
from models.database import init_db, save_understanding, get_understanding_by_repo_id
from services.repo_ingestor import parse_github_url, clone_repository
from services.parser import (
    parse_repository,
    parse_python_source,
    parse_javascript_source,
    parse_go_source,
    parse_rust_source,
)
from services.graph import build_repository_graph
from services.digest import build_repository_digest
from services.issue_fetcher import fetch_repository_issues
from services.issue_relevance import find_relevant_graph_context, format_issue_graph_digest
from services.issue_explainer import generate_grounded_issue_fallback
from services.llm import generate_repository_understanding


# Verifies parsing valid and invalid GitHub URLs into owner and repo.
def test_parse_github_url():
    owner, repo = parse_github_url("https://github.com/octocat/Hello-World")
    assert owner == "octocat"
    assert repo == "Hello-World"

    owner, repo = parse_github_url("octocat/Hello-World")
    assert owner == "octocat"
    assert repo == "Hello-World"

    with pytest.raises(ValueError):
        parse_github_url("https://invalid-url.com/something")


# Verifies local git repository cloning into a target workspace directory.
def test_clone_repository_local():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_dir = Path(tmpdir) / "Hello-World"
        res_dir = clone_repository("https://github.com/octocat/Hello-World", target_dir)
        assert res_dir.exists()
        assert (res_dir / ".git").exists()


# Verifies Tree-sitter parser extracting functions, classes, and imports from Python code.
def test_treesitter_parser_python():
    code = """
import os
from sys import path

class MyService:
    def process_data(self, item):
        return item * 2

def helper_func():
    pass
"""
    parsed = parse_python_source(code, "service.py")
    assert parsed.language == "python"
    assert len(parsed.imports) >= 2
    classes = [s for s in parsed.symbols if s.type == "class"]
    functions = [s for s in parsed.symbols if s.type in ("function", "method")]
    assert len(classes) == 1
    assert classes[0].name == "MyService"
    assert len(functions) == 2


# Verifies Tree-sitter parser extracting symbols and dependencies from JavaScript and TypeScript code.
def test_treesitter_parser_js_ts():
    code = """
import React, { useState } from 'react';
import axios from 'axios';

export class DataFetcher {
    async fetchItems() {
        return [];
    }
}

export const useData = () => {
    return useState(null);
};
"""
    parsed = parse_javascript_source(code, "component.tsx")
    assert parsed.language == "javascript"
    assert len(parsed.imports) >= 2
    classes = [s for s in parsed.symbols if s.type == "class"]
    functions = [s for s in parsed.symbols if s.type in ("function", "method")]
    assert len(classes) == 1
    assert classes[0].name == "DataFetcher"
    assert len(functions) == 2


# Verifies Tree-sitter parser extracting functions and imports from Go code.
def test_treesitter_parser_go():
    code = """
package main

import (
    "fmt"
    "net/http"
)

type Server struct {}

func (s *Server) Start() error {
    return nil
}

func main() {
    fmt.Println("Server running")
}
"""
    parsed = parse_go_source(code, "main.go")
    assert parsed.language == "go"
    assert len(parsed.imports) >= 2
    functions = [s for s in parsed.symbols if s.type in ("function", "method")]
    assert len(functions) >= 2


# Verifies Tree-sitter parser extracting functions and dependencies from Rust code.
def test_treesitter_parser_rust():
    code = """
use std::collections::HashMap;
use std::sync::Arc;

struct Engine;

impl Engine {
    fn run(&self) -> bool {
        true
    }
}

fn calculate_sum(a: i32, b: i32) -> i32 {
    a + b
}
"""
    parsed = parse_rust_source(code, "lib.rs")
    assert parsed.language == "rust"
    assert len(parsed.imports) >= 2
    functions = [s for s in parsed.symbols if s.type in ("function", "method")]
    assert len(functions) >= 2


# Verifies NetworkX graph construction, node degrees, and centrality metrics.
def test_graph_building_and_metrics():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "a.py").write_text("import b\ndef fa(): pass", encoding="utf-8")
        (root / "b.py").write_text("import c\ndef fb(): pass", encoding="utf-8")
        (root / "c.py").write_text("def fc(): pass", encoding="utf-8")

        parsed_files = parse_repository(root)
        now_iso = datetime.now(timezone.utc).isoformat()
        graph = build_repository_graph(parsed_files, "test/repo", now_iso)


        assert len(graph.nodes) == 3
        assert len(graph.edges) >= 2

        node_map = {n.id: n for n in graph.nodes}
        assert "a.py" in node_map
        assert "b.py" in node_map
        assert "c.py" in node_map
        assert node_map["c.py"].in_degree >= 1


# Verifies Louvain community clustering assigns cluster IDs and computes cluster count.
def test_graph_clustering_louvain():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        for i in range(6):
            (root / f"mod_{i}.py").write_text(f"import mod_{(i+1)%6}\ndef f(): pass", encoding="utf-8")

        parsed_files = parse_repository(root)
        now_iso = datetime.now(timezone.utc).isoformat()
        graph = build_repository_graph(parsed_files, "test/clustered", now_iso)

        assert len(graph.nodes) == 6
        assert graph.metrics.clusters_count > 0
        for node in graph.nodes:
            assert node.cluster is not None


# Verifies GitHub issue normalization and model validation.
def test_issue_model_and_parsing():
    issue = IssueSummary(
        id="test/repo#42",
        number=42,
        title="Fix memory leak in parser service",
        body="The AST parser keeps unclosed file handles in memory. See services/parser.py.",
        state="open",
        author="contributor_jane",
        labels=[IssueLabel(name="bug"), IssueLabel(name="good first issue")],
        comments_count=3,
        html_url="https://github.com/test/repo/issues/42",
        created_at="2026-03-01T10:00:00Z",
    )
    assert issue.number == 42
    label_names = [lbl.name for lbl in issue.labels]
    assert "good first issue" in label_names


# Verifies 1-hop neighborhood context matching for a specific issue.
def test_issue_neighborhood_graph_extraction():
    nodes = [
        GraphNode(id="services/parser.py", label="parser.py", language="python", line_count=100, symbols=[CodeSymbol(name="parse_file", type="function", start_line=1, end_line=10)]),
        GraphNode(id="services/graph.py", label="graph.py", language="python", line_count=200, symbols=[CodeSymbol(name="build_graph", type="function", start_line=1, end_line=20)]),
    ]
    edges = [
        GraphEdge(source="services/graph.py", target="services/parser.py", type="imports"),
    ]
    graph = GraphResponse(
        repo_id="test/repo",
        metrics=GraphMetrics(total_nodes=2, total_edges=1),
        nodes=nodes,
        edges=edges,
        updated_at="2026-03-01T10:00:00Z",
    )

    contexts = find_relevant_graph_context("Error in services/parser.py", "Traceback in parser", graph)
    assert len(contexts) >= 1
    matched_ids = [c.node_id for c in contexts]
    assert "services/parser.py" in matched_ids

    digest_text = format_issue_graph_digest(contexts)
    assert "services/parser.py" in digest_text


# Verifies structural text digest synthesis from parsed repository and graph metrics.
def test_repo_digest_generation():
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "README.md").write_text("# Project Foo\nA test project.", encoding="utf-8")
        (root / "main.py").write_text("import utils\ndef run(): pass", encoding="utf-8")
        (root / "utils.py").write_text("def helper(): pass", encoding="utf-8")

        parsed_files = parse_repository(root)
        now_iso = datetime.now(timezone.utc).isoformat()
        graph = build_repository_graph(parsed_files, "test/digest_repo", now_iso)

        repo_data = {
            "owner": "test",
            "name": "digest_repo",
            "url": "https://github.com/test/digest_repo",
            "readme_content": "# Project Foo\nA test project.",
        }
        digest = build_repository_digest(repo_data, graph)

        assert "Project Foo" in digest
        assert "Parsed Source Files" in digest


# Verifies SQLite persistence and serialization of RepoUnderstanding models.
def test_understanding_model_and_storage():
    init_db()
    repo_id = "test/understanding_repo"
    features = [
        {"name": "Auth", "description": "JWT Authentication", "files": ["auth.py", "models/user.py"]},
        {"name": "Parser", "description": "AST Parsing", "files": ["parser.py"]},
    ]
    flows = [
        {"component": "API", "role": "FastAPI routes", "central_file": "main.py", "connections": ["services/parser.py"]},
        {"component": "Services", "role": "Core business logic", "central_file": "parser.py", "connections": ["models/graph.py"]},
    ]
    now_iso = datetime.now(timezone.utc).isoformat()

    save_understanding(
        repo_id=repo_id,
        overview="Test repository understanding overview.",
        architecture_summary="Architecture and data flow description.",
        feature_map_json=json.dumps(features),
        flows_json=json.dumps(flows),
        digest_text="Digest text sample",
        model_used="gemini-3.5-flash-lite",
        is_fallback=False,
        now_iso=now_iso,
    )
    retrieved = get_understanding_by_repo_id(repo_id)

    assert retrieved is not None
    assert retrieved["overview"] == "Test repository understanding overview."
    features_loaded = json.loads(retrieved["feature_map_json"])
    assert len(features_loaded) == 2
    assert features_loaded[0]["name"] == "Auth"


# Verifies deterministic fallback repository understanding when Gemini API is unavailable.
@pytest.mark.asyncio
async def test_understanding_service_fallback():
    repo_data = {"owner": "test", "name": "offline_repo", "description": "Offline test repo"}
    understanding = await generate_repository_understanding(repo_data, "Mock repository text digest.", "test/offline_repo")
    assert understanding.overview != ""
    assert len(understanding.feature_map) > 0
    assert len(understanding.flows) > 0


if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__]))
