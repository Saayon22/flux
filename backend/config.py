# Application configuration and environment variable management using Pydantic Settings.

import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    github_token: str = ""
    gemini_api_key: str = ""
    gemini_model: str = ""
    max_diff_lines_for_pr: int = 150
    max_files_touched_for_pr: int = 4
    opencode_cli_cmd: str = "opencode"
    opencode_model: str = ""
    opencode_timeout: int = 120
    demo_mode: bool = False
    workspaces_dir: Path = Path(__file__).resolve().parent.parent / "workspaces"
    database_path: Path = Path(__file__).resolve().parent / "flux.db"
    cors_origins: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Resolves the Gemini API key from settings or environment.
    @property
    def effective_api_key(self) -> str:
        return self.gemini_api_key or os.getenv("GEMINI_API_KEY", "")

    # Resolves the effective Gemini model name from settings or environment.
    @property
    def effective_model(self) -> str:
        return self.gemini_model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
