"""Google ADK Multi-Agent Architecture for flux.

Handles repository analysis, issue triage, and autonomous agent handoff.
"""

from .coordinator import root_agent
from .runner import AgentRunner, run_agent_handoff

__all__ = ["root_agent", "AgentRunner", "run_agent_handoff"]
