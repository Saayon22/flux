# Configuration for Google ADK Agent System and Complexity Router parameters.

from pathlib import Path
from config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACES_DIR = settings.workspaces_dir

GEMINI_API_KEY = settings.effective_api_key
DEFAULT_CHEAP_MODEL = settings.effective_model
DEFAULT_STRONGEST_MODEL = settings.effective_model

MAX_DIFF_LINES_FOR_PR = settings.max_diff_lines_for_pr
MAX_FILES_TOUCHED_FOR_PR = settings.max_files_touched_for_pr

GITHUB_TOKEN = settings.github_token
OPENCODE_CLI_CMD = settings.opencode_cli_cmd
OPENCODE_MODEL = settings.opencode_model or settings.effective_model
OPENCODE_TIMEOUT = settings.opencode_timeout
DEMO_MODE = settings.demo_mode

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
