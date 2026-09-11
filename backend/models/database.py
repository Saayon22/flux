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
