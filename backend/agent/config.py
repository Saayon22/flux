"""Configuration for flux Google ADK Agent System.

Integrated and enhanced from Hackrit'26.
Defines model routing, thresholds, fallbacks, and execution parameters.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment variables are loaded from root and backend .env
load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACES_DIR = BASE_DIR.parent / "workspaces"

# Synchronize with backend settings if available
try:
    from config import settings
    _conf_github_token = settings.github_token
    _conf_gemini_key = settings.effective_api_key
    _conf_model = settings.effective_model
except Exception:
    _conf_github_token = ""
    _conf_gemini_key = ""
    _conf_model = ""

# Google Gemini model routing
GEMINI_API_KEY = _conf_gemini_key or os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY and "GEMINI_API_KEY" not in os.environ:
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY

DEFAULT_CHEAP_MODEL = _conf_model or os.getenv("REPORAMP_CHEAP_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))
DEFAULT_STRONGEST_MODEL = _conf_model or os.getenv("REPORAMP_STRONG_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))

# Complexity Router thresholds for PR vs Plan Artifact (per flux PRD)
MAX_DIFF_LINES_FOR_PR = int(os.getenv("MAX_DIFF_LINES_FOR_PR", "150"))
MAX_FILES_TOUCHED_FOR_PR = int(os.getenv("MAX_FILES_TOUCHED_FOR_PR", "4"))

# GitHub configuration
GITHUB_TOKEN = _conf_github_token or os.getenv("GITHUB_TOKEN", "")
if GITHUB_TOKEN and "GITHUB_TOKEN" not in os.environ:
    os.environ["GITHUB_TOKEN"] = GITHUB_TOKEN

# OpenCode headless configuration
OPENCODE_CLI_CMD = os.getenv("OPENCODE_CLI_CMD", "opencode")
OPENCODE_MODEL = os.getenv("OPENCODE_MODEL", "google/gemini-3.6-flash")
OPENCODE_TIMEOUT = int(os.getenv("OPENCODE_TIMEOUT", "120"))

# Demo mode & resiliency settings
DEMO_MODE = os.getenv("REPORAMP_DEMO_MODE", "false").lower() in ("true", "1", "yes")

# Known-good cached fallback diff for live-demo reliability
FALLBACK_DEMO_DIFF = """--- a/src/handler.py
+++ b/src/handler.py
@@ -10,7 +10,7 @@ def process_event(event_data: dict) -> dict:
     if not event_data.get("valid"):
         raise ValueError("Invalid event payload")
-    return {"status": "pending", "payload": event_data}
+    return {"status": "processed", "payload": event_data, "verified": True}
"""

FALLBACK_DEMO_PLAN = {
    "title": "Implementation Plan: Architectural Refactoring & High Complexity Resolution",
    "summary": "The proposed changes cross multiple module boundaries and exceed single-PR complexity thresholds.",
    "steps": [
        "1. Extract validation and error handling routines into dedicated validator service.",
        "2. Update event dispatcher and caller pipelines to handle asynchronous execution gracefully.",
        "3. Introduce unit, integration, and regression test suites across affected modules.",
        "4. Deploy behind a feature flag before merging into the main branch."
    ],
    "estimated_risk": "Moderate",
    "recommended_reviewers": ["core-maintainers", "domain-architects"]
}
