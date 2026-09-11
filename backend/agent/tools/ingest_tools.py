# Repository ingestion and static analysis tools for Google ADK agents.

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from google.adk.tools import FunctionTool, ToolContext

from config import settings
from services.repo_ingestor import clone_repository
from services.parser import parse_repository
from services.graph import build_repository_graph
from services.digest import build_repository_digest
from ..tracing import logger


# Clones a git repository into the workspaces directory.
def clone_repo(repo_url: str, target_dir: Optional[str] = None, tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    logger.info("Starting clone_repo for URL: %s", repo_url)
    clean = repo_url.replace("https://github.com/", "").replace(".git", "").strip("/")
    parts = clean.split("/")
    repo_name = parts[-1] if parts else "repo"

    target_path = Path(target_dir).resolve() if target_dir else (settings.workspaces_dir / (parts[0] if len(parts) > 1 else "default") / repo_name)

    try:
        clone_repository(repo_url, target_path)
        result = {"status": "success", "message": "Cloned repository successfully", "repo_name": repo_name, "repo_path": str(target_path)}
    except Exception as e:
        logger.warning("Git clone failed (%s). Creating fallback workspace at %s", str(e), target_path)
        target_path.mkdir(parents=True, exist_ok=True)
        sample = target_path / "main.py"
        if not sample.exists():
            sample.write_text("def entrypoint():\n    pass\n", encoding="utf-8")
        result = {"status": "fallback", "message": f"Created workspace: {e}", "repo_name": repo_name, "repo_path": str(target_path)}

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["repo_name"] = repo_name
        tool_context.state["repo_path"] = result["repo_path"]

    return result


# Parses source files in the target repository using Tree-sitter.
def parse_ast(repo_path: str, tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    logger.info("Parsing AST for repository path: %s", repo_path)
    root = Path(repo_path).resolve()
    if not root.exists():
        return {"status": "error", "error": f"Path not found: {repo_path}"}

    parse_results = parse_repository(root)
    nodes = [{"id": f"file::{r.file_path}", "type": "file", "name": r.file_path, "file": r.file_path} for r in parse_results]
    for r in parse_results:
        for sym in r.symbols:
            nodes.append({"id": f"{sym.type}::{r.file_path}::{sym.name}", "type": sym.type, "name": sym.name, "file": r.file_path, "line": sym.start_line})

    parsed_result = {"status": "success", "node_count": len(nodes), "parse_results": parse_results}

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["parse_results"] = parse_results
        tool_context.state["ast_nodes"] = nodes

    return parsed_result


# Constructs dependency graph and builds repository digest for LLM prompt context.
def build_graph_digest(repo_path: str, tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    logger.info("Building graph digest for: %s", repo_path)
    root = Path(repo_path).resolve()
    now_iso = datetime.now(timezone.utc).isoformat()

    parse_results = parse_repository(root) if root.exists() else []
    repo_id = f"{root.parent.name}/{root.name}"
    graph_resp = build_repository_graph(parse_results, repo_id, now_iso)

    repo_data = {
        "owner": root.parent.name,
        "name": root.name,
        "url": f"https://github.com/{root.parent.name}/{root.name}",
        "language": "Python",
        "description": "Analyzed repository",
    }
    digest_text = build_repository_digest(repo_data, graph_resp)

    digest = {
        "status": "success",
        "total_nodes": graph_resp.metrics.total_nodes,
        "total_edges": graph_resp.metrics.total_edges,
        "num_clusters": graph_resp.metrics.clusters_count,
        "digest_text": digest_text,
        "primary_files": [n.id for n in graph_resp.nodes][:10],
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["graph_digest"] = digest
        tool_context.state["relevant_files"] = digest["primary_files"]

    return digest


clone_repo_tool = FunctionTool(func=clone_repo)
parse_ast_tool = FunctionTool(func=parse_ast)
build_graph_digest_tool = FunctionTool(func=build_graph_digest)
