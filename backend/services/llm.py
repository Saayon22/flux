"""
LLM Repository Understanding Service.
Generates plain-English overview, feature map, and architecture summary from a repository digest
using OpenAI structured JSON output, with a deterministic grounded fallback for offline/demo reliability.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from config import settings
from models.understanding import (
    FeatureItem,
    ArchitectureFlow,
    RepoUnderstanding,
)


class LLMUnderstandingSchema(BaseModel):
    """
    Pydantic schema used for OpenAI structured JSON output response.
    """
    overview: str = Field(
        ...,
        description="Comprehensive plain-English overview of repository purpose, what problem it solves, and core stack."
    )
    architecture_summary: str = Field(
        ...,
        description="Detailed explanation of system architecture, control flow, and how central files interact."
    )
    feature_map: List[FeatureItem] = Field(
        ...,
        description="List of primary features/capabilities offered by the repository mapped to implementing files."
    )
    flows: List[ArchitectureFlow] = Field(
        ...,
        description="Architectural component connections showing how data/requests flow between modules."
    )


def _generate_grounded_fallback(
    repo_data: Dict[str, Any],
    digest: str,
    repo_id: str,
    now_iso: str
) -> RepoUnderstanding:
    """
    Synthesizes a grounded, deterministic understanding directly from the repository's
    NetworkX graph metrics, central files, and documentation.
    Guarantees the application always produces a high-quality demo result even without API keys.
    """
    name = repo_data.get("name", "Repository")
    owner = repo_data.get("owner", "")
    desc = repo_data.get("description") or f"A {repo_data.get('language', 'software')} project."
    lang = repo_data.get("language") or "General"
    file_count = repo_data.get("file_count", 0)

    # 1. Plain-English Overview
    overview = (
        f"{name} (by {owner}) is a {lang}-based software repository designed to provide: {desc} "
        f"The codebase contains approximately {file_count} files organized with modular separation "
        f"between core services, data management, and operational interfaces."
    )

    # 2. Extract central files mentioned in digest
    central_files: List[str] = []
    for line in digest.splitlines():
        if line.startswith("- `") and "Centrality:" in line:
            cf_name = line.split("`")[1]
            central_files.append(cf_name)

    # 3. Derive Architecture Flow from central files
    flows: List[ArchitectureFlow] = []
    if central_files:
        for i, cf in enumerate(central_files[:4]):
            cf_lower = cf.lower()
            if "main" in cf_lower or "app" in cf_lower or "index" in cf_lower:
                role = "Application lifecycle, server configuration, and top-level request routing"
                comp = "Entry Point / Server Core"
            elif "model" in cf_lower or "db" in cf_lower or "schema" in cf_lower:
                role = "Data persistence, schema definitions, and storage queries"
                comp = "Data & Persistence Layer"
            elif "service" in cf_lower or "util" in cf_lower or "helper" in cf_lower:
                role = "Business logic execution, external integrations, and helper routines"
                comp = "Domain & Service Logic"
            else:
                role = "Core functional module handling subsystem operations"
                comp = f"Subsystem Module ({Path(cf).stem})"

            # Link to next central file if present
            next_targets = [central_files[(i + 1) % len(central_files)]] if len(central_files) > 1 else []
            flows.append(
                ArchitectureFlow(
                    component=comp,
                    role=role,
                    central_file=cf,
                    connections=next_targets,
                )
            )
    else:
        flows.append(
            ArchitectureFlow(
                component="Root Module",
                role="Contains repository primary operations",
                central_file="root",
                connections=[],
            )
        )

    # 4. Architecture Summary
    central_list_str = ", ".join([f"`{c}`" for c in central_files[:3]]) if central_files else "root files"
    arch_summary = (
        f"The architecture is anchored around {len(central_files)} central hubs ({central_list_str}), "
        f"which exhibit the highest degree centrality in the dependency graph. "
        f"Control enters through primary orchestrators and propagates downward into specialized "
        f"utility modules and persistence layers. This modular design minimizes circular coupling "
        f"and keeps domain responsibilities isolated."
    )

    # 5. Feature Map derived from central files and documentation
    feature_map: List[FeatureItem] = [
        FeatureItem(
            name="Core Subsystem Operations",
            description=f"Primary execution and processing routines defined across central modules.",
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


async def generate_repository_understanding(
    repo_data: Dict[str, Any],
    digest: str,
    repo_id: str
) -> RepoUnderstanding:
    """
    Generates plain-English repository understanding using OpenAI structured JSON schema.
    Falls back gracefully to a deterministic grounded generator if OpenAI API is unavailable.
    
    Args:
        repo_data: Stored repository metadata dictionary.
        digest: Compact Markdown digest containing graph metrics and central files.
        repo_id: Canonical repository identifier ('owner/repo').
        
    Returns:
        RepoUnderstanding instance with overview, architecture summary, feature map, and flows.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # If no API key configured, use deterministic grounded fallback immediately
    api_key = settings.effective_api_key
    if not api_key or api_key.strip() == "":
        return _generate_grounded_fallback(repo_data, digest, repo_id, now_iso)

    model_name = settings.effective_model

    try:
        from google import genai

        client = genai.Client(api_key=api_key)

        system_prompt = (
            "You are an expert software architect analyzing an open-source codebase for new contributors. "
            "You are given a grounded repository digest containing dependency graph metrics, top central files, "
            "module clusters, and documentation highlights.\n\n"
            "You MUST reply with ONLY a valid JSON object matching this exact schema:\n"
            "{\n"
            '  "overview": "Comprehensive plain-English overview of repository purpose, what it does, and stack",\n'
            '  "architecture_summary": "Detailed explanation of system architecture, control flow, and how central files interact",\n'
            '  "feature_map": [\n'
            '    {"name": "Feature name", "description": "What it does", "files": ["path/to/file1.py"]}\n'
            "  ],\n"
            '  "flows": [\n'
            '    {"component": "Component name", "role": "Responsibility", "central_file": "path/to/file.py", "connections": ["path/to/target.py"]}\n'
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Here is the repository digest:\n\n{digest}\n\n"
            "Generate the structured JSON repository understanding."
        )

        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        # Generate structured JSON using Google GenAI SDK
        response = client.models.generate_content(
            model=model_name,
            contents=full_prompt,
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
        parsed_data = LLMUnderstandingSchema.model_validate(data_dict)

        if not parsed_data:
            raise ValueError("LLM returned empty structured response.")

        feature_map = parsed_data.feature_map
        if not feature_map:
            feature_map = [
                FeatureItem(
                    name="Core Documentation & Setup",
                    description="Foundational repository files, documentation, and configuration.",
                    files=["README.md"] if repo_data.get("readme_content") else ["root"],
                )
            ]

        flows = parsed_data.flows
        if not flows:
            flows = [
                ArchitectureFlow(
                    component="Root Documentation",
                    role="Documentation and project entry point.",
                    central_file="README.md",
                    connections=[],
                )
            ]

        return RepoUnderstanding(
            repo_id=repo_id,
            overview=parsed_data.overview,
            architecture_summary=parsed_data.architecture_summary,
            feature_map=feature_map,
            flows=flows,
            model_used=model_name,
            is_fallback=False,
            digest=digest,
            created_at=now_iso,
        )

    except Exception as e:
        print(f"[WARN] LLM call failed: {e}. Switching to grounded deterministic fallback.")
        return _generate_grounded_fallback(repo_data, digest, repo_id, now_iso)
