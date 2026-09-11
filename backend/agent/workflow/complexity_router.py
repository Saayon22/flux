# Complexity Router for evaluating patch diff metrics and routing to PR or Plan Artifact.

from typing import Any, Dict, Optional

from google.adk.tools import FunctionTool, ToolContext
from google.adk.workflow import FunctionNode
from ..config import MAX_DIFF_LINES_FOR_PR, MAX_FILES_TOUCHED_FOR_PR
from ..tracing import logger

ARCHITECTURAL_KEYWORDS = {
    "refactor", "refactoring", "architect", "architecture",
    "migration", "migrate", "isolate", "isolation",
    "overhaul", "multi-tenant", "multitenant", "rewrite", "redesign",
    "scalability", "distributed", "monolith"
}


# Pre-evaluates whether an issue should bypass code synthesis directly to an Implementation Plan.
def evaluate_issue_pre_routing(
    issue_data: Optional[Dict[str, Any]] = None,
    relevant_files: Optional[list] = None,
    estimated_complexity: Optional[str] = None,
) -> Optional[str]:
    issue_data = issue_data or {}
    title = str(issue_data.get("title", "")).lower()
    labels = [str(l.get("name", "") if isinstance(l, dict) else l).lower() for l in issue_data.get("labels", [])]
    num_files = len(relevant_files or [])
    complexity = (estimated_complexity or issue_data.get("estimated_complexity") or "").strip().lower()

    if num_files > MAX_FILES_TOUCHED_FOR_PR or complexity == "high":
        return "plan"

    text_to_check = f"{title} {' '.join(labels)}"
    if any(kw in text_to_check for kw in ARCHITECTURAL_KEYWORDS):
        return "plan"

    return None


# Evaluates diff metrics to deterministically route to 'pr' or 'plan'.
def evaluate_diff_complexity(diff_stats: Optional[Dict[str, Any]] = None, tool_context: Optional[ToolContext] = None) -> str:
    if diff_stats is None and tool_context and hasattr(tool_context, "state"):
        diff_stats = tool_context.state.get("diff_stats", {})

    diff_stats = diff_stats or {}
    line_count = diff_stats.get("line_count", 0)
    files_touched = diff_stats.get("files_touched", [])
    num_files = len(files_touched) if isinstance(files_touched, list) else 1
    validation_passed = diff_stats.get("validation_passed", True)

    is_contained = (line_count <= MAX_DIFF_LINES_FOR_PR and num_files <= MAX_FILES_TOUCHED_FOR_PR and validation_passed)
    selected_route = "pr" if is_contained else "plan"

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["routing_decision"] = selected_route

    return selected_route


# Generates a structured implementation plan artifact for complex refactoring tasks.
def generate_plan_artifact(
    diff_stats: Optional[Dict[str, Any]] = None,
    diff: Optional[str] = None,
    tool_context: Optional[ToolContext] = None,
    issue_context: Optional[str] = None,
) -> Dict[str, Any]:
    logger.info("Generating implementation plan artifact")
    if not issue_context and tool_context and hasattr(tool_context, "state"):
        issue_context = tool_context.state.get("issue_context", "")

    diff_stats = diff_stats or {}
    line_count = diff_stats.get("line_count", 0)
    files_touched = diff_stats.get("files_touched", [])
    if not isinstance(files_touched, list):
        files_touched = [str(files_touched)] if files_touched else ["src/main.py"]

    num_files = len(files_touched)
    is_pre_routed = bool(diff_stats.get("pre_routed"))
    estimated_risk = "High" if is_pre_routed or line_count > (MAX_DIFF_LINES_FOR_PR * 2) or num_files > MAX_FILES_TOUCHED_FOR_PR else "Moderate"

    steps = [
        "1. Architecture Isolation: Decouple business logic and state mutators from external boundaries.",
        "2. Component Decomposition: Break modifications down into isolated, single-responsibility sub-modules.",
        "3. Contract Validation: Ensure dependent callers and import graphs remain type-safe and backwards-compatible.",
        "4. Automated Test Harness: Implement comprehensive unit and integration suites covering touched files.",
        "5. Staged Rollout: Deploy changes behind feature flags before merging to the default branch.",
    ]

    qa_steps = [
        "Run unit tests across all touched modules with >85% code coverage.",
        "Execute end-to-end integration tests on affected API contracts.",
        "Perform regression verification on adjacent dependent components.",
    ]

    reviewers = ["core-maintainers", "domain-architects"]
    summary = "High-complexity architectural refactoring plan generated to guide safe staging and review."
    problem_statement = issue_context.strip() if issue_context else "Cross-cutting changes exceeding single-PR safety limits."

    modules_md = "\n".join([f"- `{f}`" for f in files_touched])
    steps_md = "\n".join([f"- [ ] **Step {i+1}**: {s.split('. ', 1)[-1]}" for i, s in enumerate(steps)])
    qa_md = "\n".join([f"- [ ] {q}" for q in qa_steps])

    markdown_content = f"""# Implementation Plan: Architectural Refactoring
> **Route Decision**: Plan Artifact (High Complexity)  
> **Risk Rating**: **{estimated_risk}**  

## 1. Executive Summary
{summary}

### Issue Context:
```text
{problem_statement[:600]}
```

## 2. Affected Modules
{modules_md}

## 3. Implementation Roadmap
{steps_md}

## 4. Quality Assurance
{qa_md}
"""

    plan = {
        "title": "Implementation Plan: Architectural Refactoring & High-Complexity Resolution",
        "summary": summary,
        "problem_statement": problem_statement[:300],
        "affected_modules": files_touched,
        "steps": steps,
        "quality_assurance": qa_steps,
        "estimated_risk": estimated_risk,
        "recommended_reviewers": reviewers,
        "markdown_content": markdown_content.strip(),
        "diff_metrics": {
            "line_count": line_count,
            "num_files": num_files,
            "threshold_lines": MAX_DIFF_LINES_FOR_PR,
            "threshold_files": MAX_FILES_TOUCHED_FOR_PR,
        },
    }

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["plan_artifact"] = plan

    return plan


complexity_router_node = FunctionNode(func=evaluate_diff_complexity, name="complexity_router")
generate_plan_artifact_tool = FunctionTool(func=generate_plan_artifact)
