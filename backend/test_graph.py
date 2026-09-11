"""
Automated unit and integration tests for Phase 2: AST & Dependency Graph.
Verifies Tree-sitter parsing, NetworkX metrics calculation, SQLite graph persistence,
and REST API endpoints.
"""

import asyncio
import sys
from pathlib import Path

# Ensure backend directory is in python search path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db, get_graph_by_repo_id
from services.parser import (
    parse_python_source,
    parse_javascript_source,
    parse_go_source,
    parse_rust_source,
)
from services.graph import resolve_import_to_file, build_repository_graph


def test_tree_sitter_python():
    """Verify Tree-sitter correctly extracts imports, functions, classes, and docstrings from Python."""
    py_code = """
import os
from services.github import parse_github_url

class RepoManager:
    \"\"\"Manages repositories.\"\"\"
    def clone(self, url: str):
        return True

def standalone_func():
    return 123
"""
    result = parse_python_source(py_code, "test_file.py")
    assert result.language == "python"
    assert "os" in result.imports
    assert "services.github" in result.imports
    
    symbol_names = [s.name for s in result.symbols]
    assert "RepoManager" in symbol_names
    assert "RepoManager.clone" in symbol_names
    assert "standalone_func" in symbol_names
    
    # Check docstring
    class_sym = next(s for s in result.symbols if s.name == "RepoManager")
    assert class_sym.docstring == "Manages repositories."
    print("[PASS] Tree-sitter Python AST extraction verified")


def test_tree_sitter_javascript():
    """Verify Tree-sitter extracts imports, functions, and classes from JS/TS code."""
    js_code = """
import React, { useState } from 'react';
import { Button } from './components/Button';
const utils = require('./lib/utils');

export function App() {
    return null;
}

const handleClick = () => {
    console.log("clicked");
};

class CardComponent {
    render() {}
}
"""
    result = parse_javascript_source(js_code, "src/App.tsx")
    assert result.language == "javascript"
    assert "react" in result.imports
    assert "./components/Button" in result.imports
    assert "./lib/utils" in result.imports

    symbol_names = [s.name for s in result.symbols]
    assert "App" in symbol_names
    assert "handleClick" in symbol_names
    assert "CardComponent" in symbol_names
    assert "CardComponent.render" in symbol_names
    print("[PASS] Tree-sitter JavaScript AST extraction verified")


def test_tree_sitter_go():
    """Verify Tree-sitter extracts imports, functions, methods, and structs from Go code."""
    go_code = """
package main

import (
    "fmt"
    "net/http"
    "myproject/service"
)

type Server struct {
    port int
}

func (s *Server) Start() error {
    return nil
}

func main() {
    fmt.Println("Hello")
}
"""
    result = parse_go_source(go_code, "main.go")
    assert result.language == "go"
    assert "fmt" in result.imports
    assert "myproject/service" in result.imports

    symbol_names = [s.name for s in result.symbols]
    assert "Server" in symbol_names
    assert "Server.Start" in symbol_names
    assert "main" in symbol_names
    print("[PASS] Tree-sitter Go AST extraction verified")


def test_tree_sitter_rust():
    """Verify Tree-sitter extracts imports, functions, structs, and methods from Rust code."""
    rust_code = """
use std::collections::HashMap;
mod config;
use crate::service::Engine;

pub struct App {
    name: String,
}

impl App {
    pub fn new() -> Self {
        App { name: "test".into() }
    }
}

pub fn run() {
    println!("Running");
}
"""
    result = parse_rust_source(rust_code, "src/main.rs")
    assert result.language == "rust"
    assert "std::collections::HashMap" in result.imports
    assert "mod::config" in result.imports

    symbol_names = [s.name for s in result.symbols]
    assert "App" in symbol_names
    assert "App.new" in symbol_names
    assert "run" in symbol_names
    print("[PASS] Tree-sitter Rust AST extraction verified")


def test_import_resolution():
    """Verify import statements resolve to existing local repository paths."""
    known = {
        "backend/main.py",
        "backend/services/github.py",
        "backend/models/database.py",
        "frontend/src/App.tsx",
        "frontend/src/components/Button.tsx",
        "cmd/server/main.go",
        "pkg/service/service.go",
        "src/main.rs",
        "src/config.rs",
    }
    # Python absolute & relative imports
    res1 = resolve_import_to_file("services.github", "backend/main.py", known)
    assert res1 == "backend/services/github.py", f"Expected backend/services/github.py, got {res1}"

    # JS/TS relative imports
    res2 = resolve_import_to_file("./components/Button", "frontend/src/App.tsx", known)
    assert res2 == "frontend/src/components/Button.tsx", f"Expected frontend/src/components/Button.tsx, got {res2}"

    # Go package imports
    res3 = resolve_import_to_file("myproject/pkg/service", "cmd/server/main.go", known)
    assert res3 == "pkg/service/service.go", f"Expected pkg/service/service.go, got {res3}"

    # Rust module imports
    res4 = resolve_import_to_file("mod::config", "src/main.rs", known)
    assert res4 == "src/config.rs", f"Expected src/config.rs, got {res4}"

    # External import should return None
    res5 = resolve_import_to_file("fastapi", "backend/main.py", known)
    assert res5 is None
    print("[PASS] Local import resolution logic verified for Python, JS, Go, and Rust")


async def test_graph_api_endpoints():
    """Verify POST and GET graph endpoints via FastAPI ASGI transport."""
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # First ensure octocat/Hello-World is ingested
        ingest_res = await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})
        assert ingest_res.status_code == 200

        # 1. Build graph endpoint
        build_res = await client.post("/api/repos/octocat/Hello-World/graph/build")
        assert build_res.status_code == 200, f"Graph build failed: {build_res.text}"
        data = build_res.json()
        assert "metrics" in data
        assert "nodes" in data
        assert "edges" in data
        print("[PASS] POST /api/repos/{owner}/{repo}/graph/build returned 200 OK")

        # 2. Get graph endpoint
        get_res = await client.get("/api/repos/octocat/Hello-World/graph")
        assert get_res.status_code == 200, f"Graph get failed: {get_res.text}"
        assert get_res.json()["repo_id"] == "octocat/hello-world"
        print("[PASS] GET /api/repos/{owner}/{repo}/graph returned 200 OK")

        # 3. Verify SQLite record
        db_record = get_graph_by_repo_id("octocat/hello-world")
        assert db_record is not None
        assert db_record["repo_id"] == "octocat/hello-world"
        print("[PASS] Graph persistence in SQLite verified")


if __name__ == "__main__":
    print("--- Running Graph Tests ---")
    test_tree_sitter_python()
    test_tree_sitter_javascript()
    test_tree_sitter_go()
    test_tree_sitter_rust()
    test_import_resolution()
    asyncio.run(test_graph_api_endpoints())
    print("--- All Graph Tests Passed Successfully! ---")
