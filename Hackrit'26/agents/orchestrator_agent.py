"""Orchestrator Agent for RepoRamp.

Owns the high-stakes agent handoff flow:
1. Gated by user opt-in (Human-in-the-Loop)
2. Asynchronous fork creation via LongRunningFunctionTool
3. OpenCode headless invocation with relevant files and RetryConfig
4. Deterministic Complexity Router
5. Cross-repo Pull Request publishing or structured Plan Artifact generation

Configured with the strongest coding model (default: gemini-2.5-pro / gemma-4-31b-it).
"""

from config import DEFAULT_STRONGEST_MODEL
from google.adk import Agent
from google.adk.tools import FunctionTool
from tools.github_tools import fork_repo_tool, publish_pr_tool
from tools.opencode_tool import run_opencode_tool
from tools.code_editor_tools import read_file_tool, write_file_tool, edit_file_tool, list_files_tool
from workflow.complexity_router import (
    evaluate_diff_complexity,
    generate_plan_artifact_tool,
)

ORCHESTRATOR_INSTRUCTION = """You are the RepoRamp Agent Orchestrator.
You own the end-to-end automated resolution and handoff flow for GitHub issues.
You are only invoked after explicit user opt-in.

Your execution sequence:
1. Verify user opt-in confirmation before modifying external resources.
2. Fork the repository using the fork_repo tool (which provisions asynchronously).
3. Retrieve relevant files from the session state's graph digest.
4. Invoke OpenCode headless with run_opencode using the issue context and relevant files.
5. Evaluate diff complexity deterministically using evaluate_diff_complexity:
   - If diff is contained and clean (lines <= 150, files <= 4):
     Execute publish_pr to create a Pull Request on GitHub.
   - If diff is large, cross-module, or failed validation:
     Execute generate_plan_artifact to produce a detailed architecture plan.
6. Report the final resolution status (PR URL or Plan Summary) clearly to the user.

Ensure all outputs are precise, professional, and well-documented.
"""

evaluate_diff_complexity_tool = FunctionTool(func=evaluate_diff_complexity)

orchestrator_agent = Agent(
    name="orchestrator_agent",
    description="Orchestrates the automated issue resolution handoff: forking, OpenCode execution, complexity routing, and PR/plan publishing.",
    model=DEFAULT_STRONGEST_MODEL,
    instruction=ORCHESTRATOR_INSTRUCTION,
    tools=[
        fork_repo_tool,
        run_opencode_tool,
        evaluate_diff_complexity_tool,
        publish_pr_tool,
        generate_plan_artifact_tool,
        read_file_tool,
        write_file_tool,
        edit_file_tool,
        list_files_tool,
    ],
)

# Export root_agent per ADK convention for standalone orchestrator runs
root_agent = orchestrator_agent
