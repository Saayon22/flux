# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary users are open-source contributors and maintainers onboarding to unfamiliar or complex codebases, exploring structural dependencies, and triaging and resolving issue tickets.

## Product Purpose
Flux eliminates cognitive friction when navigating unfamiliar open-source repositories. It transforms any GitHub repository into an interactive structural dependency graph, generates grounded architectural summaries, isolates 1-hop issue neighborhoods, and executes autonomous pull requests or structured implementation plans. Success means contributors can comprehend unfamiliar codebases in minutes and safely resolve issues without architectural regressions.

## Positioning
Unlike ungrounded LLM coding tools that ingest raw code dumps or rely on regex heuristics, Flux deterministically grounds understanding using multi-language Tree-sitter AST extraction and NetworkX graph-theoretic analysis (Louvain community clusters, centrality metrics). It couples compact graph digests with Google Gemini and enforces strict complexity gating: contained fixes (<=150 lines, <=4 files) trigger automated pull requests, while complex refactors yield structured implementation plan artifacts.

## Operating Context
- Target ecosystems: Python, JavaScript, TypeScript, Go, and Rust GitHub repositories.
- Environment: Web dashboard (Next.js 16, React 19, Tailwind CSS v4) communicating with a local FastAPI backend and Google ADK multi-agent runner.
- Workflow: Repository ingestion via shallow clone -> AST parsing & NetworkX graph modeling -> Gemini architectural synthesis -> interactive Obsidian-style canvas exploration -> 1-hop issue neighborhood triage -> Human-in-the-Loop agent handoff for automated PR or implementation planning.

## Capabilities and Constraints
- Multi-language AST extraction via Tree-sitter (imports, functions, classes, exports).
- Directed dependency graph modeling with NetworkX, degree centrality, and Louvain community clustering.
- Grounded Google Gemini LLM synthesis (`gemini-3.5-flash-lite` via `google-genai`) with Pydantic structured output schemas.
- 1-hop inbound and outbound neighborhood isolation for issue localization.
- Hierarchical Google ADK multi-agent orchestration (Coordinator, Summarizer, Issue Explainer, Orchestrator).
- Deterministic complexity routing: <=150 lines & <=4 files for automated fork and PR; >150 lines or cross-module refactors for Implementation Plan Artifacts.
- Strict Human-in-the-Loop authorization gate before executing automated code modifications or remote git actions.

## Brand Commitments
- Name: Flux
- Visual Identity: Warm editorial tone with Akaru-inspired aesthetic (warm cream `#f7f4ec`, terracotta `#df7d4c`, deep ink `#171817`).
- Typography: Plus Jakarta Sans for UI display and JetBrains Mono for code and AST entities.
- Voice: Precise, deterministic, grounded, engineer-oriented.

## Evidence on Hand
- Complete working implementation:
  - Backend: `backend/main.py`, `backend/agent/`, `backend/services/`, `backend/api/`.
  - Frontend: `frontend/app/page.tsx`, `frontend/app/components/ObsidianGraphCanvas.tsx`, `frontend/app/components/IssueExplorer.tsx`, `frontend/app/components/AgentHandoffModal.tsx`, `frontend/app/components/NodeInspectorDrawer.tsx`.
  - Documentation: `README.md`.
- No enterprise testimonials, production uptime benchmarks, or third-party endorsements on hand (must not be fabricated in future work).

## Product Principles
- Deterministic parsing over heuristic guesswork: Use concrete syntax trees and graph theory to identify true dependencies without code execution.
- Token efficiency through structured digests: Feed structured graph models and symbol tables to the LLM rather than dumping ungrounded source files.
- Complexity-gated autonomous action: Safe automated PRs for small, localized fixes; structured, reviewable plans for architectural refactors.
- Human-in-the-loop safety: Explicit contributor approval is always required before mutating files or initiating GitHub operations.
