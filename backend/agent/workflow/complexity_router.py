"""Complexity Router for flux Google ADK Workflow Runtime.

Implements deterministic graph-based routing based on:
- diff line count (< MAX_DIFF_LINES_FOR_PR)
- touched files count (<= MAX_FILES_TOUCHED_FOR_PR)
- validation pass/fail status

Branches:
- "pr": small/contained diff -> routes to publish_pr_tool
- "plan": large/cross-module or failed validation -> routes to generate_plan_artifact
"""

from typing import Any, Dict, Optional

from google.adk.tools import FunctionTool, ToolContext
from google.adk.workflow import FunctionNode
from ..config import (
    FALLBACK_DEMO_PLAN,
    MAX_DIFF_LINES_FOR_PR,
    MAX_FILES_TOUCHED_FOR_PR,
)
from ..tracing import logger


ARCHITECTURAL_KEYWORDS = {
    "refactor", "refactoring", "architect", "architecture",
    "migration", "migrate", "isolate", "isolation",
    "overhaul", "multi-tenant", "multitenant", "rewrite", "redesign",
    "scalability", "distributed", "monolith"
}


def evaluate_issue_pre_routing(
    issue_data: Optional[Dict[str, Any]] = None,
    relevant_files: Optional[list] = None,
    estimated_complexity: Optional[str] = None,
) -> Optional[str]:
    """Evaluates whether an issue should be pre-routed to 'plan' BEFORE attempting code synthesis.

    If an issue is already known to be high complexity, touches more files than permitted for
    an automated PR (> MAX_FILES_TOUCHED_FOR_PR), or represents a broad architectural refactor,
    we immediately bypass speculative code synthesis and route directly to the Implementation Plan.

    Args:
        issue_data: GitHub issue metadata dictionary (title, body, labels, etc.).
        relevant_files: List of file paths identified in the AST 1-hop graph neighborhood.
        estimated_complexity: Complexity string from issue explainer ('Low', 'Medium', 'High').

    Returns:
        'plan' if upfront evaluation determines high complexity/architectural scope.
        None if issue qualifies for autonomous code synthesis evaluation.
    """
    issue_data = issue_data or {}
    title = str(issue_data.get("title", "")).lower()
    body = str(issue_data.get("body", "")).lower()

    # Normalize labels
    labels = issue_data.get("labels", [])
    label_names = []
    for l in labels:
        if isinstance(l, dict):
            label_names.append(str(l.get("name", "")).lower())
        else:
            label_names.append(str(l).lower())

    files = relevant_files or []
    num_files = len(files)
    complexity = (estimated_complexity or issue_data.get("estimated_complexity") or "").strip().lower()

    # Rule 1: More relevant files than safe threshold for a single PR (> 4 files)
    if num_files > MAX_FILES_TOUCHED_FOR_PR:
        logger.info(
            "Upfront Complexity Gate: Touched files (%d) exceeds max threshold (%d) -> pre-routing to 'plan'",
            num_files,
            MAX_FILES_TOUCHED_FOR_PR,
        )
        return "plan"

    # Rule 2: Explicitly classified as 'High' complexity by Issue Explainer Agent
    if complexity == "high":
        logger.info("Upfront Complexity Gate: High estimated complexity -> pre-routing to 'plan'")
        return "plan"

    # Rule 3: Architectural overhaul keywords in title or labels
    text_to_check = f"{title} {' '.join(label_names)}"
    for kw in ARCHITECTURAL_KEYWORDS:
        if kw in text_to_check:
            logger.info(
                "Upfront Complexity Gate: Architectural keyword '%s' found in issue -> pre-routing to 'plan'",
                kw,
            )
            return "plan"

    return None


def evaluate_diff_complexity(
    diff_stats: Optional[Dict[str, Any]] = None,
    tool_context: Optional[ToolContext] = None,
) -> str:
    """Evaluates diff metrics to deterministically decide routing: 'pr' or 'plan'.

    Args:
        diff_stats: Optional dictionary of diff statistics (line_count, files_touched, validation_passed).
        tool_context: The ADK ToolContext for accessing and setting session state and route.

    Returns:
        The selected route string: 'pr' or 'plan'.
    """
    if diff_stats is None and tool_context and hasattr(tool_context, "state"):
        diff_stats = tool_context.state.get("diff_stats", {})

    diff_stats = diff_stats or {}
    line_count = diff_stats.get("line_count", 0)
    files_touched = diff_stats.get("files_touched", [])
    num_files = len(files_touched) if isinstance(files_touched, list) else 1
    validation_passed = diff_stats.get("validation_passed", True)

    logger.info(
        "Evaluating diff complexity: lines=%d (max=%d), files=%d (max=%d), validation=%s",
        line_count,
        MAX_DIFF_LINES_FOR_PR,
        num_files,
        MAX_FILES_TOUCHED_FOR_PR,
        validation_passed,
    )

    is_contained = (
        line_count <= MAX_DIFF_LINES_FOR_PR
        and num_files <= MAX_FILES_TOUCHED_FOR_PR
        and validation_passed
    )

    selected_route = "pr" if is_contained else "plan"

    if tool_context:
        if hasattr(tool_context, "state"):
            tool_context.state["routing_decision"] = selected_route
            tool_context.state["complexity_evaluation"] = {
                "line_count": line_count,
                "num_files": num_files,
                "validation_passed": validation_passed,
                "selected_route": selected_route,
                "threshold_lines": MAX_DIFF_LINES_FOR_PR,
                "threshold_files": MAX_FILES_TOUCHED_FOR_PR,
            }
        if hasattr(tool_context, "route"):
            tool_context.route = selected_route
        if hasattr(tool_context, "actions") and hasattr(tool_context.actions, "route"):
            tool_context.actions.route = selected_route

    logger.info("Complexity Router decided branch: %s", selected_route)
    return selected_route


def generate_plan_artifact(
    diff_stats: Optional[Dict[str, Any]] = None,
    diff: Optional[str] = None,
    tool_context: Optional[ToolContext] = None,
    issue_context: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates a structured plan artifact when the diff or issue is too complex for an automatic PR."""
    logger.info("Generating implementation plan artifact for complex diff or architectural issue")
    if not issue_context and tool_context and hasattr(tool_context, "state"):
        issue_context = tool_context.state.get("issue_context", "")

    diff_stats = diff_stats or {}
    line_count = diff_stats.get("line_count", 0)
    files_touched = diff_stats.get("files_touched", [])
    if not isinstance(files_touched, list):
        files_touched = [str(files_touched)] if files_touched else ["src/main.py"]

    num_files = len(files_touched)
    is_pre_routed = bool(diff_stats.get("pre_routed"))
    estimated_risk = "High" if is_pre_routed or line_count > 300 or num_files > 4 else "Moderate"

    steps = [
        "1. Architecture Isolation: Decouple business logic and state mutators from external API boundaries.",
        "2. Stepwise Component Decomposition: Break modifications down into isolated, single-responsibility sub-modules.",
        "3. AST Contract Validation: Ensure all dependent callers and import graphs remain type-safe and backwards-compatible.",
        "4. Automated Test Harness: Implement comprehensive unit, integration, and regression suites covering touched files.",
        "5. Staged Canary Rollout: Deploy changes behind feature flags before merging to the default branch.",
    ]

    qa_steps = [
        "Run unit tests across all touched modules with >85% code coverage.",
        "Execute end-to-end integration tests on affected API contracts.",
        "Perform regression verification on adjacent AST 1-hop dependent components.",
        "Verify clean linting and static analysis without regressions.",
    ]

    reviewers = ["core-maintainers", "domain-architects", "security-lead"]

    if is_pre_routed:
        summary = (
            f"Issue was identified upfront as high-complexity architectural refactoring "
            f"spanning {num_files} affected modules. flux safely bypassed speculative code generation "
            f"to produce this structured Implementation Plan Artifact for safe staging and review."
        )
    else:
        summary = (
            f"Fix complexity exceeded standard single-PR threshold ({line_count} lines across "
            f"{num_files} touched files). flux generated this structured Implementation Plan Artifact "
            f"to guide safe multi-stage rollout and code review."
        )

    problem_statement = (
        issue_context.strip() if issue_context
        else "The proposed solution introduces broad, cross-cutting changes exceeding single-PR safety limits."
    )

    # Build ready-to-download Markdown artifact
    modules_md = "\n".join([f"- `{f}`" for f in files_touched])
    steps_md = "\n".join([f"- [ ] **Step {i+1}**: {s.split('. ', 1)[-1]}" for i, s in enumerate(steps)])
    qa_md = "\n".join([f"- [ ] {q}" for q in qa_steps])
    reviewers_md = ", ".join([f"`@{r}`" for r in reviewers])
    metric_display = f"{line_count} lines changed | {num_files} file(s) touched" if line_count > 0 else f"Upfront Architectural Scope Gate | {num_files} module(s) affected"

    markdown_content = f"""# Implementation Plan: Architectural Refactoring & High-Complexity Resolution

> **Generated by flux Google ADK Complexity Router**  
> **Route Decision**: Plan Artifact (High Complexity)  
> **Risk Rating**: **{estimated_risk}**  
> **Scope Metrics**: {metric_display}  

---

## 1. Executive Summary & Root Cause
{summary}

### Issue Context & Scope:
```text
{problem_statement[:600]}
```

---

## 2. Affected Modules (AST Grounded)
The following files and their adjacent 1-hop dependency trees are impacted:
{modules_md}

---

## 3. Multi-Stage Refactoring Roadmap
{steps_md}

---

## 4. Quality Assurance & Verification
{qa_md}

---

## 5. Review & Governance
- **Recommended Reviewers**: {reviewers_md}
- **Rollout Strategy**: Canary deployment behind feature flag; verify telemetry before full merge.
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
        logger.info("Persisted rich plan_artifact into session state.")

    return plan


complexity_router_node = FunctionNode(
    func=evaluate_diff_complexity,
    name="complexity_router",
)

generate_plan_artifact_tool = FunctionTool(func=generate_plan_artifact)
