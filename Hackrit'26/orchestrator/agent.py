"""RepoRamp Orchestrator Agent Entrypoint for standalone ADK CLI execution."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.orchestrator_agent import orchestrator_agent as root_agent

__all__ = ["root_agent"]
