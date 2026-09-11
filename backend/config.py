# Application configuration and environment variable management using Pydantic Settings.

import json
import os
from pathlib import Path
from typing import Any, List
from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
_BACKEND_ENV = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ROOT_ENV)
load_dotenv(dotenv_path=_BACKEND_ENV)


class Settings(BaseSettings):
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    github_token: str = ""
    github_api_url: str = "https://api.github.com"
    git_committer_name: str = "flux-bot"
    git_committer_email: str = "bot@flux.dev"
    git_clone_timeout: int = 120
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
    http_timeout: float = 10.0
    user_agent: str = "flux-app/1.0"
    max_preview_lines: int = 600
    max_preview_bytes: int = 64 * 1024
    max_read_chars: int = 100_000

    # Normalizes CORS origins from comma-separated string or JSON array.
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Resolves the Gemini API key from settings or environment.
    @property
    def effective_api_key(self) -> str:
        return self.gemini_api_key or os.getenv("GEMINI_API_KEY", "")

    # Resolves the effective Gemini model name strictly from settings or environment.
    @property
    def effective_model(self) -> str:
        return self.gemini_model or os.getenv("GEMINI_MODEL", "")

    model_config = SettingsConfigDict(
        env_file=(str(_ROOT_ENV), str(_BACKEND_ENV), ".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
if settings.effective_model:
    os.environ["GEMINI_MODEL"] = settings.effective_model
if settings.effective_api_key:
    os.environ["GEMINI_API_KEY"] = settings.effective_api_key
