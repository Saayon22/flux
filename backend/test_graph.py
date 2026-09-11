# Unit and integration tests for AST parsing, import resolution, and dependency graph endpoints.

import asyncio
import sys
from pathlib import Path

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
from services.graph import resolve_import_to_file


# Verifies Tree-sitter AST extraction for Python source code.
def test_tree_sitter_python():
    py_code = """
import os
from services.github import parse_github_url

class RepoManager:
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


# Verifies Tree-sitter AST extraction for JavaScript/TypeScript source code.
def test_tree_sitter_javascript():
    js_code = """
import React from 'react';
import { Button } from './components/Button';
const utils = require('./lib/utils');

export function App() { return null; }
const handleClick = () => {};
class CardComponent { render() {} }
"""
    result = parse_javascript_source(js_code, "src/App.tsx")
    assert result.language == "javascript"
    assert "react" in result.imports
    assert "./components/Button" in result.imports
    symbol_names = [s.name for s in result.symbols]
    assert "App" in symbol_names
    assert "handleClick" in symbol_names
    assert "CardComponent" in symbol_names


# Verifies Tree-sitter AST extraction for Go source code.
def test_tree_sitter_go():
    go_code = """
package main
import ("fmt"; "myproject/service")
type Server struct { port int }
func (s *Server) Start() error { return nil }
func main() { fmt.Println("Hello") }
"""
    result = parse_go_source(go_code, "main.go")
    assert result.language == "go"
    assert "fmt" in result.imports
    symbol_names = [s.name for s in result.symbols]
    assert "Server" in symbol_names
    assert "Server.Start" in symbol_names
    assert "main" in symbol_names


# Verifies Tree-sitter AST extraction for Rust source code.
def test_tree_sitter_rust():
    rust_code = """
use std::collections::HashMap;
mod config;
pub struct App { name: String }
impl App { pub fn new() -> Self { App { name: "test".into() } } }
pub fn run() { println!("Running"); }
"""
    result = parse_rust_source(rust_code, "src/main.rs")
    assert result.language == "rust"
    assert "std::collections::HashMap" in result.imports
    assert "mod::config" in result.imports
    symbol_names = [s.name for s in result.symbols]
    assert "App" in symbol_names
    assert "App.new" in symbol_names
    assert "run" in symbol_names


# Verifies import statement resolution to local repository file paths.
def test_import_resolution():
    known = {
        "backend/main.py",
        "backend/services/github.py",
        "frontend/src/App.tsx",
        "frontend/src/components/Button.tsx",
        "cmd/server/main.go",
        "pkg/service/service.go",
        "src/main.rs",
        "src/config.rs",
    }
    assert resolve_import_to_file("services.github", "backend/main.py", known) == "backend/services/github.py"
    assert resolve_import_to_file("./components/Button", "frontend/src/App.tsx", known) == "frontend/src/components/Button.tsx"
    assert resolve_import_to_file("myproject/pkg/service", "cmd/server/main.go", known) == "pkg/service/service.go"
    assert resolve_import_to_file("mod::config", "src/main.rs", known) == "src/config.rs"
    assert resolve_import_to_file("fastapi", "backend/main.py", known) is None


# Verifies dependency graph build and retrieval API endpoints.
async def test_graph_api_endpoints():
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})
        build_res = await client.post("/api/repos/octocat/Hello-World/graph/build")
        assert build_res.status_code == 200
        data = build_res.json()
        assert "metrics" in data
        assert "nodes" in data

        get_res = await client.get("/api/repos/octocat/Hello-World/graph")
        assert get_res.status_code == 200
        assert get_res.json()["repo_id"] == "octocat/hello-world"
        assert get_graph_by_repo_id("octocat/hello-world") is not None


if __name__ == "__main__":
    test_tree_sitter_python()
    test_tree_sitter_javascript()
    test_tree_sitter_go()
    test_tree_sitter_rust()
    test_import_resolution()
    asyncio.run(test_graph_api_endpoints())
