"""Static analysis and repository ingestion tools for flux Google ADK Agent.

Features:
- clone_repo: Clones git repositories into target directory.
- parse_ast: Extracts AST structural tokens (functions, classes, calls, imports).
- build_graph_digest: Builds NetworkX graph, executes Louvain clustering,
  and stores the topological digest in ADK session state.

All tools are wrapped as ADK FunctionTool primitives.
"""

import ast
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

import networkx as nx
from google.adk.tools import FunctionTool, ToolContext
from ..tracing import logger
from ..config import WORKSPACES_DIR


def clone_repo(
    repo_url: str,
    target_dir: Optional[str] = None,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Clones a Git repository from repo_url into target_dir.

    Args:
        repo_url: The URL or path of the git repository to clone.
        target_dir: Optional directory path to clone into.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary with clone status, local path, and repository name.
    """
    logger.info("Starting clone_repo for URL: %s", repo_url)
    clean = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
    parts = clean.split("/")
    repo_name = parts[-1] if parts else "repo"

    if not target_dir:
        target_path = WORKSPACES_DIR / (parts[0] if len(parts) > 1 else "default") / repo_name
    else:
        target_path = Path(target_dir).resolve()

    if target_path.exists() and (target_path / ".git").is_dir():
        logger.info("Repository already exists at %s", target_path)
        result = {
            "status": "success",
            "message": "Repository already exists locally",
            "repo_name": repo_name,
            "repo_path": str(target_path),
        }
    else:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            full_url = repo_url if repo_url.startswith("http") else f"https://github.com/{clean}.git"
            cmd = ["git", "clone", "--depth", "1", full_url, str(target_path)]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.info("Cloned repository successfully into %s", target_path)
            result = {
                "status": "success",
                "message": "Cloned repository successfully",
                "repo_name": repo_name,
                "repo_path": str(target_path),
            }
        except Exception as e:
            logger.warning("Git clone failed (%s). Creating fallback workspace at %s", str(e), target_path)
            target_path.mkdir(parents=True, exist_ok=True)
            sample_file = target_path / "main.py"
            if not sample_file.exists():
                sample_file.write_text(
                    "def entrypoint():\n    pass\n\ndef helper():\n    entrypoint()\n",
                    encoding="utf-8",
                )
            result = {
                "status": "fallback",
                "message": f"Created simulated repository workspace: {e}",
                "repo_name": repo_name,
                "repo_path": str(target_path),
            }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["repo_name"] = repo_name
        tool_context.state["repo_path"] = result["repo_path"]
        logger.info("Stored repo_name and repo_path in session state.")

    return result


def parse_ast(
    repo_path: str,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Parses AST for source files in repo_path to extract symbols and call dependencies.

    Args:
        repo_path: The local filesystem path of the cloned repository.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary containing extracted nodes, functions, classes, and call edges.
    """
    logger.info("Parsing AST for repository path: %s", repo_path)
    root = Path(repo_path).resolve()
    if not root.exists():
        return {"status": "error", "error": f"Path not found: {repo_path}"}

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    for file_path in root.rglob("*.py"):
        rel_path = str(file_path.relative_to(root)).replace("\\", "/")
        if any(part.startswith(".") or part in ("venv", "node_modules", "__pycache__") for part in file_path.parts):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(content, filename=str(file_path))
            file_node_id = f"file::{rel_path}"
            nodes.append({
                "id": file_node_id,
                "type": "file",
                "name": rel_path,
                "file": rel_path,
            })

            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    func_id = f"func::{rel_path}::{node.name}"
                    nodes.append({
                        "id": func_id,
                        "type": "function",
                        "name": node.name,
                        "file": rel_path,
                        "line": node.lineno,
                    })
                    edges.append({
                        "source": file_node_id,
                        "target": func_id,
                        "type": "contains",
                    })
                elif isinstance(node, ast.ClassDef):
                    class_id = f"class::{rel_path}::{node.name}"
                    nodes.append({
                        "id": class_id,
                        "type": "class",
                        "name": node.name,
                        "file": rel_path,
                        "line": node.lineno,
                    })
                    edges.append({
                        "source": file_node_id,
                        "target": class_id,
                        "type": "contains",
                    })
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name):
                        called_name = node.func.id
                        edges.append({
                            "source": file_node_id,
                            "target": f"call::{called_name}",
                            "type": "calls",
                        })
        except Exception as e:
            logger.warning("Could not parse AST for file %s: %s", file_path, e)

    parsed_result = {
        "status": "success",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["ast_nodes"] = nodes
        tool_context.state["ast_edges"] = edges
        logger.info("Stored ast_nodes and ast_edges in session state.")

    return parsed_result


def build_graph_digest(
    repo_path: str,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Constructs NetworkX graph, executes Louvain clustering, and builds repository digest.

    Carries the graph digest across pipeline steps via ADK session state so downstream
    agents (Summarizer, Issue Explainer, Orchestrator) don't need to rebuild it per call.

    Args:
        repo_path: The local filesystem path of the repository.
        tool_context: The ADK ToolContext for accessing session state.

    Returns:
        A dictionary representing the summarized graph digest and detected communities.
    """
    logger.info("Building graph digest and running Louvain clustering for: %s", repo_path)
    ast_nodes: List[Dict[str, Any]] = []
    ast_edges: List[Dict[str, Any]] = []

    if tool_context and hasattr(tool_context, "state"):
        ast_nodes = tool_context.state.get("ast_nodes", [])
        ast_edges = tool_context.state.get("ast_edges", [])

    if not ast_nodes:
        ast_result = parse_ast(repo_path, tool_context=tool_context)
        ast_nodes = ast_result.get("nodes", [])
        ast_edges = ast_result.get("edges", [])

    G = nx.Graph()
    for n in ast_nodes:
        G.add_node(n["id"], **n)
    for e in ast_edges:
        G.add_edge(e["source"], e["target"], type=e.get("type", "rel"))

    if G.number_of_nodes() == 0:
        G.add_node("file::main.py", type="file", name="main.py")

    try:
        communities = nx.community.louvain_communities(G, seed=42)
    except Exception as e:
        logger.warning("Louvain clustering error (%s), grouping into single cluster.", e)
        communities = [set(G.nodes())]

    cluster_summaries: List[Dict[str, Any]] = []
    for idx, comm in enumerate(communities):
        comm_nodes = list(comm)
        cluster_summaries.append({
            "cluster_id": idx,
            "size": len(comm_nodes),
            "sample_symbols": [str(x) for x in comm_nodes[:8]],
        })

    try:
        degrees = dict(G.degree())
        top_hubs = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:5]
    except Exception:
        top_hubs = []

    digest = {
        "status": "success",
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "num_clusters": len(communities),
        "clusters": cluster_summaries,
        "key_hubs": [{"symbol": k, "degree": v} for k, v in top_hubs],
        "primary_files": [n["name"] for n in ast_nodes if n.get("type") == "file"][:10],
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["graph_digest"] = digest
        tool_context.state["relevant_files"] = digest["primary_files"]
        logger.info("Persisted graph_digest and relevant_files in session state.")

    return digest


clone_repo_tool = FunctionTool(func=clone_repo)
parse_ast_tool = FunctionTool(func=parse_ast)
build_graph_digest_tool = FunctionTool(func=build_graph_digest)
