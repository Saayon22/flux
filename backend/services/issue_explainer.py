"""
LLM Issue Explanation Service.
Translates an open GitHub issue and its grounded 1-hop dependency graph neighborhood
into a plain-English explanation, real-world analogy, and actionable implementation checklist.
"""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from config import settings
from models.issue import (
    RelevantFileItem,
    IssueExplanation,
)
from services.issue_relevance import RelevantNodeContext, format_issue_graph_digest


class LLMIssueExplanationSchema(BaseModel):
    """Pydantic schema for structured JSON response from LLM."""
    plain_english_summary: str = Field(
        ...,
        description="Comprehensive plain-English explanation of the problem, bug, or feature request."
    )
    real_world_analogy: str = Field(
        ...,
        description="A vivid, intuitive real-world analogy explaining the issue without technical jargon."
    )
    relevant_files: List[RelevantFileItem] = Field(
        ...,
        description="List of files to inspect or modify, with specific reasons and symbols."
    )
    implementation_steps: List[str] = Field(
        ...,
        description="Numbered, step-by-step checklist of actionable developer tasks to resolve the issue."
    )
    estimated_complexity: str = Field(
        "Medium",
        description="Estimated difficulty level: 'Low', 'Medium', or 'High'."
    )


def _generate_grounded_fallback(
    issue_data: Dict[str, Any],
    graph_contexts: List[RelevantNodeContext],
    repo_id: str,
    issue_number: int,
    now_iso: str
) -> IssueExplanation:
    """
    Synthesizes a grounded deterministic issue explanation from issue text
    and graph metrics. Guarantees 100% uptime for hackathon demo resilience.
    """
    title = issue_data.get("title", f"Issue #{issue_number}")
    body = issue_data.get("body") or "No description provided."

    summary = (
        f"Issue #{issue_number} ('{title}') requests a fix or enhancement to the codebase: {body[:300]}... "
        f"The primary goal is to modify the relevant module logic while ensuring dependent callers continue to function."
    )

    analogy = (
        f"Think of this issue like updating a recipe in a restaurant kitchen. The dish ('{title}') needs an adjustment "
        f"in ingredients or preparation steps, and we need to make sure the front-of-house staff (callers) receive "
        f"the updated order without any disruption to the rest of the menu."
    )

    relevant_files: List[RelevantFileItem] = []
    if graph_contexts:
        for ctx in graph_contexts:
            relevant_files.append(
                RelevantFileItem(
                    file=ctx.node_id,
                    reason=ctx.reason,
                    symbols_to_inspect=ctx.symbols or ["main functions"],
                )
            )
    else:
        relevant_files.append(
            RelevantFileItem(
                file="README.md",
                reason="Repository foundational file",
                symbols_to_inspect=[],
            )
        )

    complexity = "Low" if len(relevant_files) <= 1 else "Medium" if len(relevant_files) <= 3 else "High"

    steps = [
        f"Locate and inspect `{relevant_files[0].file}` and review its current implementation.",
        f"Implement the requested logic changes for '{title}'.",
        f"Verify inbound dependencies ({', '.join(graph_contexts[0].predecessors[:2]) if graph_contexts and graph_contexts[0].predecessors else 'unit tests'}) remain unbroken.",
        "Test changes locally and prepare for agent handoff or pull request.",
    ]

    return IssueExplanation(
        issue_id=f"{repo_id}#{issue_number}",
        repo_id=repo_id,
        issue_number=issue_number,
        plain_english_summary=summary,
        real_world_analogy=analogy,
        relevant_files=relevant_files,
        implementation_steps=steps,
        estimated_complexity=complexity,
        model_used="deterministic-grounded-fallback",
        is_fallback=True,
        created_at=now_iso,
    )


async def generate_issue_explanation(
    issue_data: Dict[str, Any],
    graph_contexts: List[RelevantNodeContext],
    repo_id: str,
    issue_number: int
) -> IssueExplanation:
    """
    Generates a plain-English explanation, analogy, and task checklist for an issue
    grounded in the 1-hop graph neighborhood.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    api_key = settings.effective_api_key

    # If no API key configured, use deterministic grounded fallback immediately
    if not api_key or api_key.strip() == "":
        return _generate_grounded_fallback(issue_data, graph_contexts, repo_id, issue_number, now_iso)

    model_name = settings.effective_model
    base_url = settings.effective_base_url

    graph_digest = format_issue_graph_digest(graph_contexts)
    title = issue_data.get("title", "")
    body = issue_data.get("body", "")

    try:
        from openai import OpenAI

        client_kwargs: Dict[str, Any] = {
            "api_key": api_key,
            "default_headers": {
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "flux",
            }
        }
        if base_url:
            client_kwargs["base_url"] = base_url

        client = OpenAI(**client_kwargs)

        system_prompt = (
            "You are an expert senior software engineer onboarding a new contributor to resolve a GitHub issue. "
            "You are provided with the issue title, description, and the grounded 1-hop codebase neighborhood "
            "(files and functions) extracted from the repository's AST dependency graph.\n\n"
            "You MUST respond with ONLY a valid JSON object matching this exact schema:\n"
            "{\n"
            '  "plain_english_summary": "Clear, friendly explanation of what this issue is asking for and why it matters.",\n'
            '  "real_world_analogy": "A memorable real-world analogy explaining this problem intuitively to anyone.",\n'
            '  "relevant_files": [\n'
            '    {"file": "path/to/file.py", "reason": "Why this file must be inspected or changed", "symbols_to_inspect": ["func1", "func2"]}\n'
            "  ],\n"
            '  "implementation_steps": [\n'
            '    "Step 1: Inspect ...",\n'
            '    "Step 2: Modify ...",\n'
            '    "Step 3: Verify ..."\n'
            "  ],\n"
            '  "estimated_complexity": "Low" | "Medium" | "High"\n'
            "}"
        )

        user_prompt = (
            f"Repository: {repo_id}\n"
            f"Issue #{issue_number}: {title}\n\n"
            f"Description:\n{body[:1500]}\n\n"
            f"{graph_digest}\n\n"
            "Analyze the issue and generate the structured JSON explanation."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # Use standard chat.completions.create with json_object format for universal model compatibility
        completion = client.chat.completions.create(
            model=model_name,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
        )

        raw_text = completion.choices[0].message.content or "{}"
        if "```" in raw_text:
            raw_text = raw_text.split("```json")[-1].split("```")[0].strip()

        data_dict = json.loads(raw_text)
        parsed = LLMIssueExplanationSchema.model_validate(data_dict)

        return IssueExplanation(
            issue_id=f"{repo_id}#{issue_number}",
            repo_id=repo_id,
            issue_number=issue_number,
            plain_english_summary=parsed.plain_english_summary,
            real_world_analogy=parsed.real_world_analogy,
            relevant_files=parsed.relevant_files,
            implementation_steps=parsed.implementation_steps,
            estimated_complexity=parsed.estimated_complexity,
            model_used=model_name,
            is_fallback=False,
            created_at=now_iso,
        )

    except Exception as e:
        print(f"[WARN] LLM issue explanation failed: {e}. Switching to grounded deterministic fallback.")
        return _generate_grounded_fallback(issue_data, graph_contexts, repo_id, issue_number, now_iso)
