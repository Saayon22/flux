# flux — Phase-Wise Build Plan

## Phase 1 — Repository Ingestion
- Accept GitHub repository URL
- Clone repository into `workspaces/`
- Read README and CONTRIBUTING/docs
- Store basic repository metadata

**Done when:** URL → local repository.

## Phase 2 — AST & Dependency Graph
- Parse the MVP language with Tree-sitter
- Extract imports, functions, calls, and relationships
- Build NetworkX dependency graph
- Calculate basic graph metrics

**Done when:** Repository → dependency graph.

## Phase 3 — Repository Understanding
- Build compact graph/document digest
- Generate repository overview
- Generate feature map
- Generate architecture summary using Google Gemini (`google-genai`)

**Done when:** Repository → plain-English understanding.

## Phase 4 — Graph Explorer
- Show dependency graph with React Flow
- Add zoom, pan, node selection
- Show file/function details
- Keep large graphs readable with filtering/clustering

**Done when:** User can explore repository structure visually.

## Phase 5 — Issue Discovery & Explanation
- Fetch live GitHub issues
- Filter by labels
- Open a selected issue
- Find relevant files/functions from the graph
- Generate plain-English explanation, analogy, and task summary

**Done when:** Issue → clear implementation task.

## Phase 6 — Agent Handoff
- Add user opt-in handoff (Human-in-the-Loop gate)
- Create fork only on handoff with async readiness polling
- Prepare relevant issue/context/files
- Run Google ADK Autonomous Agent with code patch synthesis
- Capture generated diff

**Done when:** Issue → real code diff.

## Phase 7 — Complexity Routing & PR ✅ (Completed & Verified)
- Deterministic diff complexity evaluation (line count threshold: 150, file count threshold: 4, validation pass/fail)
- Contained patches -> Authenticated git checkout, patch application, push to fork, and GitHub PR creation via REST API
- Complex/cross-module patches -> Rich Implementation Plan Artifact generation (Root cause, affected AST modules, refactoring steps, QA checklist, risk rating)
- SQLite persistence (`handoff_results` table) and REST API endpoint (`GET /api/repos/{owner}/{repo}/issues/{issue_number}/handoff`)
- Downloadable Markdown Plan Artifact (`flux-plan-issue-{number}.md`)

**Done when:** Diff → Authenticated GitHub PR or Downloadable Implementation Plan Artifact with SQLite persistence.

## Phase 8 — Integration & Demo Hardening ✅ (Completed & Verified)
- Global System Health & Rate-Limit Status Bar (Gemini 3.6 Flash, Google ADK 2.9.0 Multi-Agent, GitHub API quota)
- 1-Click Live Rehearsal Quick-Pills (`Roxy-06/Eduzen` full-stack, `octocat/Hello-World` minimal, `pallets/flask` complex)
- 1-Click Full Analysis Auto-Pipeline (Ingestion → AST Graph → Gemini Understanding in sequence)
- 5-Step Visual Pipeline Stepper on the dashboard
- Resilient fallback handling and cached demo safety net
- Automated End-to-End Test Suite (`backend/test_phase7_phase8_e2e.py`) verifying all 8 phases

**Done when:** Complete end-to-end demo runs zero-touch with 1-click execution.

## Build Priority

```text
Phase 1 → Phase 2 → Phase 3
                     ↓
                  Phase 4
                     ↓
                  Phase 5
                     ↓
                  Phase 6
                     ↓
                  Phase 7
                     ↓
                  Phase 8
```

## MVP Rule

Do not build stretch features until the complete Phase 1–7 pipeline works.

**Core demo:**

```text
GitHub URL
→ Repository Understanding
→ Dependency Graph
→ Issue Explanation
→ Agent Handoff
→ PR / Implementation Plan
```
