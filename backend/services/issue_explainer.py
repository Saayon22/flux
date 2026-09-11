# LLM Issue Explanation Service using Google Gemini with deterministic fallback.

import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from config import settings
from models.issue import RelevantFileItem, IssueExplanation
from services.issue_relevance import RelevantNodeContext, format_issue_graph_digest


# Structured schema for LLM issue explanation response.
class LLMIssueExplanationSchema(BaseModel):
    plain_english_summary: str = Field(..., description="Plain-English explanation of the issue")
    real_world_analogy: str = Field(..., description="Real-world analogy explaining the issue")
    relevant_files: List[RelevantFileItem] = Field(..., description="List of files and reasons")
    implementation_steps: List[str] = Field(..., description="Actionable developer checklist")
    estimated_complexity: str = Field("Medium", description="Estimated complexity: Low, Medium, High")


# Generates deterministic issue explanation when API key is not present.
def generate_grounded_issue_fallback(
    issue_data: Dict[str, Any],
    graph_contexts: List[RelevantNodeContext],
    repo_id: str,
    issue_number: int,
    now_iso: str
) -> IssueExplanation:
    title = issue_data.get("title", f"Issue #{issue_number}")
    body = issue_data.get("body") or "No description provided."

    summary = (
        f"Issue #{issue_number} ('{title}') requests a fix or enhancement: {body[:300]}... "
        f"The goal is to modify the relevant module logic while ensuring callers continue to function."
    )

    analogy = (
        f"Think of this issue like updating a recipe in a restaurant kitchen. The dish ('{title}') needs an adjustment "
        f"in ingredients or preparation, and callers must receive the update without disrupting other items."
    )

    relevant_files = [
        RelevantFileItem(file=ctx.node_id, reason=ctx.reason, symbols_to_inspect=ctx.symbols or ["main functions"])
        for ctx in graph_contexts
    ] if graph_contexts else [RelevantFileItem(file="README.md", reason="Foundational file", symbols_to_inspect=[])]

    complexity = "Low" if len(relevant_files) <= 1 else "Medium" if len(relevant_files) <= 3 else "High"
    steps = [
        f"Locate and inspect `{relevant_files[0].file}` and review its implementation.",
        f"Implement the requested logic changes for '{title}'.",
        "Verify dependencies and unit tests remain unbroken.",
        "Test changes locally and prepare for agent handoff.",
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


# Generates plain-English issue explanation grounded in the 1-hop graph neighborhood.
async def generate_issue_explanation(
    issue_data: Dict[str, Any],
    graph_contexts: List[RelevantNodeContext],
    repo_id: str,
    issue_number: int
) -> IssueExplanation:
    now_iso = datetime.now(timezone.utc).isoformat()
    api_key = settings.effective_api_key

    if not api_key:
        return generate_grounded_issue_fallback(issue_data, graph_contexts, repo_id, issue_number, now_iso)

    model_name = settings.effective_model
    graph_digest = format_issue_graph_digest(graph_contexts)
    title = issue_data.get("title", "")
    body = issue_data.get("body", "")

    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        prompt = (
            "You are an expert senior software engineer onboarding a new contributor to resolve a GitHub issue. "
            "You are provided with the issue title, description, and the grounded 1-hop codebase neighborhood.\n\n"
            f"Repository: {repo_id}\n"
            f"Issue #{issue_number}: {title}\n\n"
            f"Description:\n{body[:1500]}\n\n"
            f"{graph_digest}\n\n"
            "Analyze the issue and generate the structured JSON explanation."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": LLMIssueExplanationSchema,
                "temperature": 0.2,
            },
        )

        raw_text = response.text or "{}"
        if "```" in raw_text:
            raw_text = raw_text.split("```json")[-1].split("```")[0].strip()

        parsed = LLMIssueExplanationSchema.model_validate(json.loads(raw_text))

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
    except Exception:
        return generate_grounded_issue_fallback(issue_data, graph_contexts, repo_id, issue_number, now_iso)
