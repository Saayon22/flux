"""Local code editing tools for RepoRamp ADK Agent.

Enables the agent to:
- Read local files
- Write new files
- Edit existing files with search/replace
- List files in local directories
- Apply unified diff patches directly to disk
"""

import os
from pathlib import Path
from typing import Any, Dict, Optional

from google.adk.tools import FunctionTool, ToolContext
from tracing import logger


def read_file(file_path: str, tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    """Reads content from a local file.

    Args:
        file_path: Path to the file to read.
        tool_context: Optional ADK ToolContext.

    Returns:
        Dictionary with file content or error.
    """
    path = Path(file_path).resolve()
    logger.info("Reading local file: %s", path)
    if not path.exists() or not path.is_file():
        return {"status": "error", "error": f"File not found: {file_path}"}
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        return {"status": "success", "file_path": str(path), "content": content}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def write_file(file_path: str, content: str, tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    """Writes content to a local file, creating parent directories if needed.

    Args:
        file_path: Path to the file to write.
        content: The code or text content to write.
        tool_context: Optional ADK ToolContext.

    Returns:
        Dictionary with status and write confirmation.
    """
    path = Path(file_path).resolve()
    logger.info("Writing local file: %s", path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return {
            "status": "success",
            "message": f"Successfully wrote {len(content)} characters to {path}",
            "file_path": str(path),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def edit_file(
    file_path: str,
    target_snippet: str,
    replacement_snippet: str,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Edits a local file by replacing a specific snippet of code with a new snippet.

    Args:
        file_path: Path to the file to edit.
        target_snippet: Exact text/code block to locate and replace.
        replacement_snippet: Replacement text/code block.
        tool_context: Optional ADK ToolContext.

    Returns:
        Dictionary with replacement status and diff details.
    """
    path = Path(file_path).resolve()
    logger.info("Editing local file: %s", path)
    if not path.exists() or not path.is_file():
        return {"status": "error", "error": f"File not found: {file_path}"}

    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        if target_snippet not in content:
            return {
                "status": "error",
                "error": "Target snippet not found in file. Please verify exact whitespace and lines.",
            }

        new_content = content.replace(target_snippet, replacement_snippet, 1)
        path.write_text(new_content, encoding="utf-8")
        return {
            "status": "success",
            "message": f"Successfully edited {path}",
            "file_path": str(path),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def list_files(dir_path: str = ".", tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    """Lists files and folders in a local directory.

    Args:
        dir_path: Path to the directory.
        tool_context: Optional ADK ToolContext.

    Returns:
        Dictionary containing list of files and directories.
    """
    path = Path(dir_path).resolve()
    logger.info("Listing files in directory: %s", path)
    if not path.exists() or not path.is_dir():
        return {"status": "error", "error": f"Directory not found: {dir_path}"}

    try:
        entries = []
        for entry in path.iterdir():
            if entry.name.startswith(".") or entry.name in ("__pycache__", "node_modules", "venv"):
                continue
            entries.append({
                "name": entry.name,
                "is_dir": entry.is_dir(),
                "size_bytes": entry.stat().st_size if entry.is_file() else 0,
            })
        return {"status": "success", "dir_path": str(path), "entries": entries}
    except Exception as e:
        return {"status": "error", "error": str(e)}


read_file_tool = FunctionTool(func=read_file)
write_file_tool = FunctionTool(func=write_file)
edit_file_tool = FunctionTool(func=edit_file)
list_files_tool = FunctionTool(func=list_files)
