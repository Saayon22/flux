"""Configuration for RepoRamp ADK Agent System.

Defines model routing (Gemma 4 / Gemini), tracing, timeouts,
and environment settings matching RepoRamp_ADK_Feature_Spec.md.
"""

import os

# Model routing configuration per PRD and user environment
# Default cheap model: gemini-3.6-flash (or gemma-4 when available)
DEFAULT_CHEAP_MODEL = os.getenv("REPORAMP_CHEAP_MODEL", "gemini-3.6-flash")
# Strongest coding model reserved for Orchestrator handoff step
DEFAULT_STRONGEST_MODEL = os.getenv("REPORAMP_STRONG_MODEL", "gemini-3.6-flash")


# Complexity Router thresholds for PR vs Plan Artifact
MAX_DIFF_LINES_FOR_PR = int(os.getenv("MAX_DIFF_LINES_FOR_PR", "150"))
MAX_FILES_TOUCHED_FOR_PR = int(os.getenv("MAX_FILES_TOUCHED_FOR_PR", "4"))

# GitHub configuration
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# OpenCode headless configuration
OPENCODE_CLI_CMD = os.getenv("OPENCODE_CLI_CMD", "opencode")
OPENCODE_MODEL = os.getenv("OPENCODE_MODEL", "google/gemini-2.5-pro")
OPENCODE_TIMEOUT = int(os.getenv("OPENCODE_TIMEOUT", "120"))

# Demo mode & resiliency settings
DEMO_MODE = os.getenv("REPORAMP_DEMO_MODE", "true").lower() in ("true", "1", "yes")

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
    "title": "Implementation Plan for Issue: Refactor Event Pipeline",
    "summary": "The proposed changes cross module boundaries and exceed single-PR complexity thresholds.",
    "steps": [
        "1. Extract validation logic into dedicated validator service.",
        "2. Update event dispatcher to asynchronously queue unverified events.",
        "3. Add unit and integration tests across data ingestion pipeline.",
        "4. Deploy behind feature flag before activating production traffic."
    ],
    "estimated_risk": "Moderate",
    "recommended_reviewers": ["core-architecture-team"]
}
