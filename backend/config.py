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

    # OpenAI API configuration (swappable: gpt-4o-mini, gpt-4o)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = ""

    # OpenRouter configuration (allows using OpenRouter models like deepseek/deepseek-v4-flash-0731)
    openrouter_api_key: str = ""
    openrouter_model: str = "deepseek/deepseek-v4-flash-0731"

    @property
    def effective_api_key(self) -> str:
        """Returns OpenRouter key if set, otherwise OpenAI key."""
        return self.openrouter_api_key or self.openai_api_key

    @property
    def effective_base_url(self) -> str:
        """Returns OpenRouter base URL if OpenRouter key is set, otherwise configured base_url."""
        if self.openrouter_api_key:
            return self.openai_base_url or "https://openrouter.ai/api/v1"
        return self.openai_base_url or ""

    @property
    def effective_model(self) -> str:
        """Returns OpenRouter model if OpenRouter key is set, otherwise openai_model."""
        if self.openrouter_api_key:
            return self.openrouter_model or "deepseek/deepseek-v4-flash-0731"
        return self.openai_model

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
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Global singleton instance for settings
settings = Settings()

# Ensure workspaces directory exists
settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
