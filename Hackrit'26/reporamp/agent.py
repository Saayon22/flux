"""RepoRamp Agent Entrypoint for ADK CLI."""

import sys
from pathlib import Path

# Add project root to sys.path so agents and tools can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from agent import root_agent

__all__ = ["root_agent"]
