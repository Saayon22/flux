"""
Database initialization and connection management using SQLite.
Stores repository metadata, documentation text, clone paths, and ingestion state.
"""

import sqlite3
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
from config import settings


def get_db_connection() -> sqlite3.Connection:
    """
    Creates and returns a connection to the SQLite database with row factory enabled
    so query results can be accessed like dictionaries.
    """
    conn = sqlite3.connect(str(settings.database_path))
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """
    Context manager for database connections, automatically committing on success
    and closing the connection when the block exits.
    """
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """
    Initializes database tables if they do not already exist.
    Creates the 'repositories' table for storing repository metadata and documents.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repositories (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                owner TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                default_branch TEXT DEFAULT 'main',
                language TEXT,
                stars INTEGER DEFAULT 0,
                open_issues_count INTEGER DEFAULT 0,
                clone_path TEXT NOT NULL,
                readme_content TEXT,
                contributing_content TEXT,
                file_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repository_graphs (
                repo_id TEXT PRIMARY KEY,
                nodes_count INTEGER DEFAULT 0,
                edges_count INTEGER DEFAULT 0,
                metrics_json TEXT NOT NULL,
                graph_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repository_understandings (
                repo_id TEXT PRIMARY KEY,
                overview TEXT NOT NULL,
                architecture_summary TEXT NOT NULL,
                feature_map_json TEXT NOT NULL,
                flows_json TEXT NOT NULL,
                digest_text TEXT NOT NULL,
                model_used TEXT NOT NULL,
                is_fallback INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS repository_issues (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL,
                issue_number INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                state TEXT NOT NULL,
                author TEXT,
                labels_json TEXT NOT NULL,
                comments_count INTEGER DEFAULT 0,
                github_url TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS issue_explanations (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL,
                issue_number INTEGER NOT NULL,
                plain_english_summary TEXT NOT NULL,
                real_world_analogy TEXT NOT NULL,
                implementation_steps_json TEXT NOT NULL,
                relevant_files_json TEXT NOT NULL,
                estimated_complexity TEXT NOT NULL,
                model_used TEXT NOT NULL,
                is_fallback INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            )
        """)
        conn.commit()


def save_repository(repo_data: Dict[str, Any]) -> None:
    """
    Inserts or updates a repository record in SQLite.
    
    Args:
        repo_data: Dictionary containing fields corresponding to the repositories table schema.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO repositories (
                id, url, owner, name, description, default_branch,
                language, stars, open_issues_count, clone_path,
                readme_content, contributing_content, file_count,
                status, error_message, created_at, updated_at
            ) VALUES (
                :id, :url, :owner, :name, :description, :default_branch,
                :language, :stars, :open_issues_count, :clone_path,
                :readme_content, :contributing_content, :file_count,
                :status, :error_message, :created_at, :updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
                url=excluded.url,
                owner=excluded.owner,
                name=excluded.name,
                description=excluded.description,
                default_branch=excluded.default_branch,
                language=excluded.language,
                stars=excluded.stars,
                open_issues_count=excluded.open_issues_count,
                clone_path=excluded.clone_path,
                readme_content=excluded.readme_content,
                contributing_content=excluded.contributing_content,
                file_count=excluded.file_count,
                status=excluded.status,
                error_message=excluded.error_message,
                updated_at=excluded.updated_at
        """, repo_data)


def get_repository_by_id(repo_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a repository record by its ID (e.g., 'owner/repo').
    
    Args:
        repo_id: Case-insensitive unique repository identifier ('owner/repo').
        
    Returns:
        Dictionary of repository attributes if found, None otherwise.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM repositories WHERE LOWER(id) = LOWER(?)", (repo_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def list_repositories(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Lists the most recently ingested repositories.
    
    Args:
        limit: Maximum number of records to return.
        
    Returns:
        List of repository dictionaries ordered by updated_at descending.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM repositories ORDER BY updated_at DESC LIMIT ?",
            (limit,)
        )
        return [dict(row) for row in cursor.fetchall()]


def save_graph(
    repo_id: str,
    nodes_count: int,
    edges_count: int,
    metrics_json: str,
    graph_json: str,
    now_iso: str
) -> None:
    """
    Saves or updates a repository's dependency graph and metrics in SQLite.
    
    Args:
        repo_id: Case-insensitive unique repository identifier ('owner/repo').
        nodes_count: Number of nodes in the graph.
        edges_count: Number of edges in the graph.
        metrics_json: JSON string of computed graph metrics.
        graph_json: Complete JSON serialization of nodes and edges.
        now_iso: Current ISO timestamp.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO repository_graphs (
                repo_id, nodes_count, edges_count, metrics_json,
                graph_json, created_at, updated_at
            ) VALUES (
                :repo_id, :nodes_count, :edges_count, :metrics_json,
                :graph_json, :created_at, :updated_at
            )
            ON CONFLICT(repo_id) DO UPDATE SET
                nodes_count=excluded.nodes_count,
                edges_count=excluded.edges_count,
                metrics_json=excluded.metrics_json,
                graph_json=excluded.graph_json,
                updated_at=excluded.updated_at
        """, {
            "repo_id": repo_id.lower(),
            "nodes_count": nodes_count,
            "edges_count": edges_count,
            "metrics_json": metrics_json,
            "graph_json": graph_json,
            "created_at": now_iso,
            "updated_at": now_iso,
        })


def get_graph_by_repo_id(repo_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the dependency graph and metrics record for a repository by its ID.
    
    Args:
        repo_id: Case-insensitive repository identifier ('owner/repo').
        
    Returns:
        Dictionary containing graph record if found, None otherwise.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM repository_graphs WHERE LOWER(repo_id) = LOWER(?)",
            (repo_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def save_understanding(
    repo_id: str,
    overview: str,
    architecture_summary: str,
    feature_map_json: str,
    flows_json: str,
    digest_text: str,
    model_used: str,
    is_fallback: bool,
    now_iso: str
) -> None:
    """
    Saves or updates a repository's plain-English understanding and architectural summary in SQLite.
    
    Args:
        repo_id: Case-insensitive unique repository identifier ('owner/repo').
        overview: High-level plain-English repository overview.
        architecture_summary: Grounded architecture and data flow explanation.
        feature_map_json: JSON string of extracted features and associated files.
        flows_json: JSON string of component connection flows.
        digest_text: Compact digest text used as prompt context.
        model_used: Name of model used (or fallback indicator).
        is_fallback: True if generated via deterministic grounded fallback.
        now_iso: Current ISO timestamp.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO repository_understandings (
                repo_id, overview, architecture_summary, feature_map_json,
                flows_json, digest_text, model_used, is_fallback,
                created_at, updated_at
            ) VALUES (
                :repo_id, :overview, :architecture_summary, :feature_map_json,
                :flows_json, :digest_text, :model_used, :is_fallback,
                :created_at, :updated_at
            )
            ON CONFLICT(repo_id) DO UPDATE SET
                overview=excluded.overview,
                architecture_summary=excluded.architecture_summary,
                feature_map_json=excluded.feature_map_json,
                flows_json=excluded.flows_json,
                digest_text=excluded.digest_text,
                model_used=excluded.model_used,
                is_fallback=excluded.is_fallback,
                updated_at=excluded.updated_at
        """, {
            "repo_id": repo_id.lower(),
            "overview": overview,
            "architecture_summary": architecture_summary,
            "feature_map_json": feature_map_json,
            "flows_json": flows_json,
            "digest_text": digest_text,
            "model_used": model_used,
            "is_fallback": 1 if is_fallback else 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        })


def get_understanding_by_repo_id(repo_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the plain-English understanding record for a repository by its ID.
    
    Args:
        repo_id: Case-insensitive repository identifier ('owner/repo').
        
    Returns:
        Dictionary containing understanding record if found, None otherwise.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM repository_understandings WHERE LOWER(repo_id) = LOWER(?)",
            (repo_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def save_issues(repo_id: str, issues: List[Dict[str, Any]]) -> None:
    """
    Inserts or updates a list of GitHub issues for a repository in SQLite.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        for issue in issues:
            issue_id = f"{repo_id.lower()}#{issue['number']}"
            cursor.execute("""
                INSERT INTO repository_issues (
                    id, repo_id, issue_number, title, body, state,
                    author, labels_json, comments_count, github_url,
                    created_at, updated_at
                ) VALUES (
                    :id, :repo_id, :issue_number, :title, :body, :state,
                    :author, :labels_json, :comments_count, :github_url,
                    :created_at, :updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    body=excluded.body,
                    state=excluded.state,
                    author=excluded.author,
                    labels_json=excluded.labels_json,
                    comments_count=excluded.comments_count,
                    updated_at=excluded.updated_at
            """, {
                "id": issue_id,
                "repo_id": repo_id.lower(),
                "issue_number": issue["number"],
                "title": issue["title"],
                "body": issue.get("body") or "",
                "state": issue.get("state", "open"),
                "author": issue.get("author") or "",
                "labels_json": issue.get("labels_json") or "[]",
                "comments_count": issue.get("comments_count", 0),
                "github_url": issue.get("html_url") or "",
                "created_at": issue.get("created_at") or "",
                "updated_at": issue.get("updated_at") or "",
            })


def get_issues_by_repo_id(repo_id: str, label_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieves stored GitHub issues for a repository, optionally filtered by label.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        if label_filter and label_filter.strip().lower() != "all":
            # Filter by label within JSON text
            pattern = f'%"{label_filter.strip()}"%'
            cursor.execute(
                "SELECT * FROM repository_issues WHERE LOWER(repo_id) = LOWER(?) AND labels_json LIKE ? ORDER BY issue_number DESC",
                (repo_id, pattern)
            )
        else:
            cursor.execute(
                "SELECT * FROM repository_issues WHERE LOWER(repo_id) = LOWER(?) ORDER BY issue_number DESC",
                (repo_id,)
            )
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def save_issue_explanation(
    repo_id: str,
    issue_number: int,
    data: Dict[str, Any],
    now_iso: str
) -> None:
    """
    Inserts or updates an issue explanation record in SQLite.
    """
    explanation_id = f"{repo_id.lower()}#{issue_number}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO issue_explanations (
                id, repo_id, issue_number, plain_english_summary,
                real_world_analogy, implementation_steps_json,
                relevant_files_json, estimated_complexity,
                model_used, is_fallback, created_at, updated_at
            ) VALUES (
                :id, :repo_id, :issue_number, :plain_english_summary,
                :real_world_analogy, :implementation_steps_json,
                :relevant_files_json, :estimated_complexity,
                :model_used, :is_fallback, :created_at, :updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
                plain_english_summary=excluded.plain_english_summary,
                real_world_analogy=excluded.real_world_analogy,
                implementation_steps_json=excluded.implementation_steps_json,
                relevant_files_json=excluded.relevant_files_json,
                estimated_complexity=excluded.estimated_complexity,
                model_used=excluded.model_used,
                is_fallback=excluded.is_fallback,
                updated_at=excluded.updated_at
        """, {
            "id": explanation_id,
            "repo_id": repo_id.lower(),
            "issue_number": issue_number,
            "plain_english_summary": data["plain_english_summary"],
            "real_world_analogy": data["real_world_analogy"],
            "implementation_steps_json": data["implementation_steps_json"],
            "relevant_files_json": data["relevant_files_json"],
            "estimated_complexity": data.get("estimated_complexity", "Medium"),
            "model_used": data.get("model_used", "unknown"),
            "is_fallback": 1 if data.get("is_fallback") else 0,
            "created_at": now_iso,
            "updated_at": now_iso,
        })


def get_issue_explanation(repo_id: str, issue_number: int) -> Optional[Dict[str, Any]]:
    """
    Retrieves the cached explanation for a specific issue.
    """
    explanation_id = f"{repo_id.lower()}#{issue_number}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM issue_explanations WHERE id = ?",
            (explanation_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None

