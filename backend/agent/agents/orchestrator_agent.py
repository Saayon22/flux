# Orchestrator Agent definition for autonomous code generation and handoff workflow.

from google.adk import Agent
from google.adk.tools import FunctionTool
from ..config import DEFAULT_STRONGEST_MODEL
from ..tools.github_tools import fork_repo_tool, publish_pr_tool
from ..tools.opencode_tool import run_opencode_tool
from ..tools.code_editor_tools import read_file_tool, write_file_tool, edit_file_tool, list_files_tool
from ..workflow.complexity_router import evaluate_diff_complexity, generate_plan_artifact_tool

ORCHESTRATOR_INSTRUCTION = """You are the flux Agent Orchestrator.
You execute automated issue resolution and handoff flow after explicit user opt-in:
1. Verify user opt-in.
2. Fork the repository.
3. Synthesize code fix diff.
4. Evaluate diff complexity: open PR if contained, generate Plan Artifact if complex."""

evaluate_diff_complexity_tool = FunctionTool(func=evaluate_diff_complexity)

orchestrator_agent = Agent(
    name="orchestrator_agent",
    description="Orchestrates automated issue resolution: forking, code execution, complexity routing, and PR/plan publishing.",
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

root_agent = orchestrator_agent
