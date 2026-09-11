# Summarizer Agent definition for analyzing repository structure and architecture overviews.

from google.adk import Agent
from ..config import DEFAULT_CHEAP_MODEL
from ..tools.ingest_tools import build_graph_digest_tool, clone_repo_tool, parse_ast_tool

SUMMARIZER_INSTRUCTION = """You are the flux Repository Summarizer Agent.
Your role is to analyze a code repository and provide developers with a clear, concise architectural overview.
Use clone_repo, parse_ast, and build_graph_digest to analyze structure and explain clusters and hubs."""

summarizer_agent = Agent(
    name="summarizer_agent",
    description="Analyzes repository structure, runs AST parsing and clustering, and explains architecture.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=SUMMARIZER_INSTRUCTION,
    tools=[clone_repo_tool, parse_ast_tool, build_graph_digest_tool],
)
