"""
Configuration module for the flux backend.
Loads environment variables and sets project-wide paths and API tokens using Pydantic Settings.
"""

from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables or .env file.
    """
    # GitHub Personal Access Token (optional, raises rate limit from 60 to 5,000 req/hr)
    github_token: str = ""

    # Absolute path to the workspaces directory where repositories will be cloned
    workspaces_dir: Path = Path(__file__).resolve().parent.parent / "workspaces"

    # Absolute path to the SQLite database file
    database_path: Path = Path(__file__).resolve().parent / "flux.db"

    # Allowed CORS origins for Next.js frontend communication
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Global singleton instance for settings
settings = Settings()

# Ensure workspaces directory exists
settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
