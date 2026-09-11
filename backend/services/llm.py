# LLM Repository Understanding Service using Google Gemini with deterministic fallback.

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from config import settings
from models.understanding import FeatureItem, ArchitectureFlow, RepoUnderstanding


# Structured schema definition for Gemini structured JSON output.
class LLMUnderstandingSchema(BaseModel):
    overview: str = Field(..., description="Plain-English overview of repository purpose and stack")
    architecture_summary: str = Field(..., description="Explanation of architecture, control flow, and interactions")
    feature_map: List[FeatureItem] = Field(..., description="List of capabilities mapped to files")
    flows: List[ArchitectureFlow] = Field(..., description="Architectural flows between modules")


# Generates deterministic repository understanding from digest metrics when API key is not present.
def generate_grounded_fallback(repo_data: Dict[str, Any], digest: str, repo_id: str, now_iso: str) -> RepoUnderstanding:
    name = repo_data.get("name", "Repository")
    owner = repo_data.get("owner", "")
    desc = repo_data.get("description") or f"A {repo_data.get('language', 'software')} project."
    lang = repo_data.get("language") or "General"
    file_count = repo_data.get("file_count", 0)

    overview = (
        f"{name} (by {owner}) is a {lang}-based software repository designed to provide: {desc} "
        f"The codebase contains approximately {file_count} files organized with modular separation "
        f"between core services, data management, and operational interfaces."
    )

    # Extracts central files identified in the digest
    central_files: List[str] = []
    for line in digest.splitlines():
        if line.startswith("- `") and "Centrality:" in line:
            central_files.append(line.split("`")[1])

    flows: List[ArchitectureFlow] = []
    if central_files:
        for i, cf in enumerate(central_files[:4]):
            cf_lower = cf.lower()
            if any(k in cf_lower for k in ("main", "app", "index")):
                role, comp = "Application lifecycle, server configuration, and top-level request routing", "Entry Point / Server Core"
            elif any(k in cf_lower for k in ("model", "db", "schema")):
                role, comp = "Data persistence, schema definitions, and storage queries", "Data & Persistence Layer"
            elif any(k in cf_lower for k in ("service", "util", "helper")):
                role, comp = "Business logic execution, external integrations, and helper routines", "Domain & Service Logic"
            else:
                role, comp = "Core functional module handling subsystem operations", f"Subsystem Module ({Path(cf).stem})"

            next_targets = [central_files[(i + 1) % len(central_files)]] if len(central_files) > 1 else []
            flows.append(ArchitectureFlow(component=comp, role=role, central_file=cf, connections=next_targets))
    else:
        flows.append(ArchitectureFlow(component="Root Module", role="Contains repository primary operations", central_file="root", connections=[]))

    central_list_str = ", ".join([f"`{c}`" for c in central_files[:3]]) if central_files else "root files"
    arch_summary = (
        f"The architecture is anchored around {len(central_files)} central hubs ({central_list_str}), "
        f"which exhibit the highest degree centrality in the dependency graph. "
        f"Control enters through primary orchestrators and propagates downward into specialized "
        f"utility modules and persistence layers."
    )

    feature_map = [
        FeatureItem(
            name="Core Subsystem Operations",
            description="Primary execution and processing routines defined across central modules.",
            files=central_files[:3] if central_files else ["README.md"],
        ),
        FeatureItem(
            name="Configuration & Environment Management",
            description="Manages configuration parameters, environment settings, and runtime paths.",
            files=[c for c in central_files if "config" in c.lower() or "setting" in c.lower()] or central_files[:1],
        ),
    ]

    return RepoUnderstanding(
        repo_id=repo_id,
        overview=overview,
        architecture_summary=arch_summary,
        feature_map=feature_map,
        flows=flows,
        model_used="deterministic-grounded-fallback",
        is_fallback=True,
        digest=digest,
        created_at=now_iso,
    )


# Generates repository understanding using Gemini structured JSON output or falls back to deterministic analysis.
async def generate_repository_understanding(repo_data: Dict[str, Any], digest: str, repo_id: str) -> RepoUnderstanding:
    now_iso = datetime.now(timezone.utc).isoformat()
    api_key = settings.effective_api_key

    if not api_key:
        return generate_grounded_fallback(repo_data, digest, repo_id, now_iso)

    model_name = settings.effective_model

    try:
        from google import genai
        client = genai.Client(api_key=api_key)

        prompt = (
            "You are an expert software architect analyzing an open-source codebase for new contributors. "
            "You are given a grounded repository digest containing dependency graph metrics, top central files, "
            "module clusters, and documentation highlights.\n\n"
            f"Here is the repository digest:\n\n{digest}\n\n"
            "Generate the structured JSON repository understanding."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": LLMUnderstandingSchema,
                "temperature": 0.2,
            },
        )

        raw_text = response.text or "{}"
        if "```" in raw_text:
            raw_text = raw_text.split("```json")[-1].split("```")[0].strip()

        data_dict = json.loads(raw_text)
        parsed = LLMUnderstandingSchema.model_validate(data_dict)

        return RepoUnderstanding(
            repo_id=repo_id,
            overview=parsed.overview,
            architecture_summary=parsed.architecture_summary,
            feature_map=parsed.feature_map or [FeatureItem(name="Core Setup", description="Foundational setup", files=["README.md"])],
            flows=parsed.flows or [ArchitectureFlow(component="Root", role="Entry point", central_file="README.md", connections=[])],
            model_used=model_name,
            is_fallback=False,
            digest=digest,
            created_at=now_iso,
        )
    except Exception:
        return generate_grounded_fallback(repo_data, digest, repo_id, now_iso)
