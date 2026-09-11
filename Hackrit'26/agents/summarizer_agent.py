"""Summarizer Agent for RepoRamp.

Uses cheap/efficient model (default: Gemma 4 / gemma-4-31b-it) to generate
high-level repository summaries and architectural cluster overviews
grounded in the static analysis graph digest.
"""

from config import DEFAULT_CHEAP_MODEL
from google.adk import Agent
from tools.ingest_tools import build_graph_digest_tool, clone_repo_tool, parse_ast_tool

SUMMARIZER_INSTRUCTION = """You are the RepoRamp Repository Summarizer Agent.
Your role is to analyze a code repository and provide developers with a clear, concise
architectural overview.

Your workflow:
1. Use clone_repo to obtain the target repository if needed.
2. Use parse_ast to extract functions, classes, and call structures.
3. Use build_graph_digest to run Louvain community clustering and detect key module hubs.
4. Synthesize the graph digest from session state to explain:
   - Total files and complexity
   - Detected module communities (functional clusters)
   - Core dependency hubs and entrypoints
   - A brief onboarding recommendation for new contributors.

Keep your explanations concise, structured, and developer-friendly.
"""

summarizer_agent = Agent(
    name="summarizer_agent",
    description="Analyzes repository structure, runs AST parsing and Louvain clustering, and explains architecture.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=SUMMARIZER_INSTRUCTION,
    tools=[clone_repo_tool, parse_ast_tool, build_graph_digest_tool],
)
