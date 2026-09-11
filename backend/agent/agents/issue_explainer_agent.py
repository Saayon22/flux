"""Issue Explainer Agent for flux.

Uses Google GenAI model (default: gemini-3.6-flash) to explain
GitHub issues in the context of the repository's graph digest and
highlight the relevant source files without dumping raw AST or full trees.
"""

from google.adk import Agent
from ..config import DEFAULT_CHEAP_MODEL
from ..tools.github_tools import fetch_issue_tool
from ..tools.ingest_tools import build_graph_digest_tool

ISSUE_EXPLAINER_INSTRUCTION = """You are the flux Issue Explainer Agent.
Your role is to explain GitHub issues in the context of the repository's architecture.

Your workflow:
1. Use fetch_issue to retrieve the issue details (title, body, labels).
2. Check the repository graph digest from session state (or invoke build_graph_digest).
3. Connect the issue's symptoms to specific files and symbols in the graph.
4. Identify the minimal set of relevant files that need inspection/modification.
5. Provide the developer with:
   - Root cause hypothesis
   - Key affected components/clusters
   - Suggested files to inspect
   - A recommendation on whether to hand off to the Orchestrator for automated resolution.

Never dump raw AST or the entire source code; communicate using concise architectural summaries.
"""

issue_explainer_agent = Agent(
    name="issue_explainer_agent",
    description="Fetches GitHub issues and maps them against the repository graph digest to identify affected files and root causes.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=ISSUE_EXPLAINER_INSTRUCTION,
    tools=[fetch_issue_tool, build_graph_digest_tool],
)
