# flux — Product Requirements Document

## 1. Problem
New contributors waste days reading unfamiliar codebases and guessing what vague `good-first-issue` tickets actually mean before they can make a first meaningful contribution.

## 2. Solution
flux takes a GitHub URL, builds a grounded understanding of the repo (via static analysis, not just LLM guesswork), explains issues in plain English using that understanding, and — when the user opts in — hands the issue off to an autonomous coding agent that produces a real pull request.

## 3. Core User Flow
1. **Paste GitHub URL** → flux clones the repo, parses source files into ASTs, and builds a dependency graph (files/functions and their relationships).
2. **Understand the repo** → An LLM generates a plain-English overview, feature map, and architecture summary, grounded in the dependency graph, README, and CONTRIBUTING docs. The graph is shown as a visual diagram.
3. **Browse & select an issue** → User filters live GitHub issues by label (`good-first-issue`, `bug`, `documentation`, etc.).
4. **Understand the issue** → LLM explains the selected issue in plain English, using the dependency graph to identify which files/functions it likely touches, plus a real-world analogy and a concrete "what do I actually need to change" summary.
5. **Decide** → User chooses to either work on it themselves, or hand it off to the agent.
6. **Agent handoff (opt-in)** → Only at this point does flux fork the repo (lazy forking — no fork is created until a user actually requests a handoff), poll until the fork is ready, then invoke OpenCode in headless mode with the issue context + relevant files from the graph, and let it edit code.
7. **Complexity routing** → If the resulting diff is small/contained, flux commits, pushes, and opens a PR automatically. If it's large/crosses many modules/fails validation, flux instead generates a short implementation plan artifact instead of forcing a PR.

## 4. Scope

**MVP (demo-critical):**
- Full pipeline works end-to-end on real, arbitrary public repos, including the fork flow (fork → poll until ready → push → cross-repo PR).
- AST parsing + dependency graph for at least one major language (pick based on team's stack, e.g. JS/TS or Python).
- LLM repo summary + issue explanation, grounded in the graph.
- OpenCode headless invocation (`opencode run --dir <path> --model <provider/model> "<prompt>" --auto`) producing a real diff.
- Complexity-routing fallback (plan artifact vs. PR).
- Lazy forking: no fork is created on URL paste; fork happens only when a user requests agent handoff on a specific issue.
- Issue explanations generated on-demand (only when a user opens a specific issue), not upfront for every filtered issue.
- One clean, pre-tested happy-path repo/issue combo rehearsed for the live demo, even though the system is built to handle arbitrary repos.

**Stretch (post-MVP):**
- Multi-language AST support beyond the first language.
- Session resumption / iterating on a rejected PR.
- Multi-provider model selection exposed to the user.
- Test-running the agent's diff before opening the PR.

**Model/provider choice:** not yet decided — architecture should treat the LLM (for summarization/explanation) and OpenCode's model backend as swappable config, not hardcoded. Design intent: route summarization/explanation (low stakes, high volume) to a cheap/free-tier model called directly via API; reserve the strongest available coding-capable model specifically for OpenCode's code-editing step (low volume, highest stakes). OpenCode should be used **only** for the code-editing/diff step — not for summarization or issue explanation, which are plain text-in/text-out tasks better served by a direct LLM API call.

## 5. Architecture Components
| Component | Responsibility |
|---|---|
| Repo Ingestor | Clone repo (read-only, happens immediately on URL paste, regardless of fork status), read README/CONTRIBUTING/wiki |
| AST/Dependency Parser | tree-sitter parses each file → query-extract imports/functions/calls into per-file JSON → networkx graph → compute in-degree/out-degree/clusters (e.g. Louvain community detection) |
| Digest Builder | Template the graph's computed metrics + top-N central files + clusters into a short plain-text/JSON digest for LLM prompts (never sends raw AST or full source by default) |
| Summarizer (LLM) | Turn the digest + docs into plain-English overview & architecture explanation (direct API call, not OpenCode) |
| Issue Fetcher | Pull & filter live GitHub issues by label |
| Issue Explainer (LLM) | On-demand: build a 1-hop graph neighborhood digest around files the issue mentions, translate issue + that digest into plain English, analogy, and task summary (direct API call, not OpenCode) |
| Graph Renderer (UI) | Obsidian-style force-directed graph (e.g. d3-force / react-force-graph) — draggable, zoomable node-link view of the dependency graph; caps/clusters nodes to avoid an unreadable "hairball" on large repos |
| Agent Orchestrator | On handoff only: fork repo (lazy, with poll/retry for provisioning) or branch directly if pre-staged/owned, invoke OpenCode headless (`opencode run --dir <path> --model <provider/model> "<prompt>" --auto`) with issue context + relevant files from the graph, capture diff result |
| Complexity Router | Decide PR vs. plan-artifact based on diff size/scope/validation result |
| PR Publisher | Commit, push, open PR via GitHub API |

## 6. LLM Call Budget (per session)
| Step | Calls | Notes |
|---|---|---|
| Repo summary/overview | 1 (up to 2–3 if split into overview/feature-map/architecture) | Direct API call |
| Issue explanation | 1 per issue actually opened | On-demand only, not upfront for the full filtered list |
| Agent handoff (OpenCode) | 1 invocation from our code | May internally trigger several sub-calls inside OpenCode's own agent loop — budget/test against free-tier limits early |
| Plan artifact | 1 | Only fires when complexity routing triggers |

## 7. Key Risks & Mitigations
- **Agent fix quality varies by issue complexity** (inherent, not solvable by us) → Complexity Router falls back to a plan artifact instead of a broken/oversized PR.
- **Fork provisioning race condition** (GitHub forks are async) → poll/retry before pushing to the fork.
- **OpenCode/LLM call failures during live demo** → cache a known-good fallback result for the rehearsed demo repo/issue.
- **Graph parsing failing on unusual repo structures** → scope MVP language support to what's reliably testable before demo day.

## 8. Success Criteria (Demo)
- Live: paste a real public repo URL → see grounded summary + dependency graph.
- Live: pick a real issue → see plain-English explanation + analogy.
- Live: opt into handoff → see a real PR opened on a forked repo (or a plan artifact if complexity routing triggers).
- At least one rehearsed run completes with zero manual intervention.

## 9. Out of Scope
- Guaranteeing correctness of agent-generated fixes.
- Supporting private/auth-gated repos.
- Multi-agent collaboration or long-running background jobs beyond a single issue handoff.
- Production-grade rate limiting, billing, or multi-tenant auth.
