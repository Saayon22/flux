# RepoRamp — Phase-Wise Build Plan

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
- Generate architecture summary using OpenAI

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
- Add user opt-in handoff
- Create fork only on handoff
- Prepare relevant issue/context/files
- Run OpenCode headlessly
- Capture generated diff

**Done when:** Issue → real code diff.

## Phase 7 — Complexity Routing & PR
- Evaluate diff size/scope
- Route simple fixes to PR
- Route complex/failed fixes to implementation plan
- Commit, push, and create GitHub PR

**Done when:** Diff → PR or plan.

## Phase 8 — Integration & Demo Hardening
- Connect the complete flow
- Handle GitHub/LLM/OpenCode failures
- Add loading and error states
- Test the complete happy path
- Rehearse one known-good repository + issue

**Done when:** Complete demo works with minimal manual intervention.

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
