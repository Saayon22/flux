# RepoRamp — Google ADK Feature Spec & Handover

## 0. Ground Rule
The agent layer of RepoRamp is built **strictly on Google ADK (`google-adk`, Python, 2.x)**. No custom LLM-calling loops, no hand-rolled polling/retry logic, no bespoke multi-agent routing — if ADK has a primitive for it, use the ADK primitive. Only the static-analysis layer (tree-sitter, networkx, Louvain clustering) and the OpenCode subprocess call stay outside ADK's agent loop, wrapped as ADK Tools.

---

## 1. Features Needed Right Now (MVP)

| # | Feature | Maps to ADK primitive | Why |
|---|---|---|---|
| 1 | Separate agents per role (Summarizer, Issue Explainer, Orchestrator) | **Modular Multi-Agent Systems** | Keeps model choice per-agent swappable — cheap model on Summarizer/Explainer, strongest coding model reserved for the handoff step. |
| 2 | Repo clone, AST parse, digest build as callable steps | **FunctionTool** | ADK builds the tool schema from your Python type hints/docstrings — no manual JSON schema writing. |
| 3 | GitHub issue fetch, fork, and PR publish | **FunctionTool**, check ADK's built-in **GitHub integration** (Tools & Integrations Ecosystem, Feb 2026) before hand-rolling | May cover fetch/fork/PR directly instead of raw REST calls. |
| 4 | Fork provisioning poll/retry | **LongRunningFunctionTool** | Exact fit for "kick off an async operation, poll until ready" — replaces a hand-rolled sleep/retry loop. |
| 5 | Complexity Router (PR vs. plan artifact) | **Workflow Runtime** (graph-based routing node) | Deterministic branching on diff size/scope/validation result — not an LLM free-text decision. |
| 6 | User opt-in before agent handoff | **Human-in-the-Loop** (built into Workflow Runtime) | Native confirmation-gate pattern instead of custom "waiting on user" UI state. |
| 7 | Carrying the graph digest across pipeline steps | **Session state** | Build the digest once, reuse it in summary, issue explanation, and handoff — don't rebuild per call. |
| 8 | OpenCode headless invocation | **FunctionTool** (or LongRunningFunctionTool if slow) wrapping a subprocess call | OpenCode is external; it is not reimplemented as an ADK agent, only invoked as a tool. |
| 9 | Debugging the live-demo pipeline | **Built-in tracing/observability** | Needed given the documented risk of LLM/OpenCode failures during the rehearsed demo. |
| 10 | Model routing (cheap vs. strongest model) | **Model-agnostic config / LiteLLM support** | Matches the PRD's "swappable config, not hardcoded" requirement. |
| 11 | Local iteration before deploy | `adk web` (dev UI), `adk api_server` (serve mode) | Test the multi-agent flow locally before wiring into the RepoRamp frontend. |

**Not covered by ADK, stays custom:** tree-sitter parsing, networkx graph construction, Louvain clustering, the force-directed graph renderer (frontend, not agent-side). These are called *from* FunctionTools but are not ADK features themselves.

---

## 2. Handover Section — Agent Handoff (Step 5–7 of the PRD flow)

This section is the detailed, step-by-step spec for the **Agent Orchestrator**, the component that fires only when the user opts into handoff. It is the highest-stakes, highest-complexity piece — build it after Summarizer and Issue Explainer are working.

### Step 1 — Define the Orchestrator as its own ADK agent
**What it does:** Owns the entire handoff flow: fork → poll → invoke OpenCode → capture diff → route to PR or plan artifact.
**How to implement in ADK:**
- Create `orchestrator_agent.py` exposing `root_agent`, per ADK's code-first convention (`agent.py` + `root_agent`, or a `root_agent.yaml` if you prefer declarative config).
- Keep it separate from the Summarizer/Issue Explainer agents — it should only be invoked after the user's explicit opt-in, never proactively.
- Configure it with the strongest available coding-capable model (per the PRD's model-routing intent), since this is the low-volume, highest-stakes call.

### Step 2 — Wrap repo forking as a LongRunningFunctionTool
**What it does:** Forks are lazy — created only on handoff, and GitHub forks provision asynchronously, so the tool needs to kick off the fork and poll until it's ready.
**How to implement in ADK:**
- Write a Python function `fork_repo(repo_url: str, tool_context: Optional[Context] = None)` and register it as `LongRunningFunctionTool`, not `FunctionTool`.
- Inside, kick off the GitHub fork call, then poll (with backoff) until the fork resolves as ready.
- ADK's long-running pattern lets the agent loop yield control while the poll happens, rather than blocking the whole session — use this instead of a manual `time.sleep` retry loop.
- Store the resulting fork URL/ref in **session state** so downstream tools (OpenCode invocation, PR publisher) can read it without re-fetching.

### Step 3 — Wrap OpenCode invocation as a Tool
**What it does:** Runs `opencode run --dir <path> --model <provider/model> "<prompt>" --auto` with the issue context and relevant graph files, and captures the resulting diff.
**How to implement in ADK:**
- Write `run_opencode(issue_context: str, relevant_files: list[str], tool_context: Optional[Context] = None)` as a `FunctionTool` (or `LongRunningFunctionTool` if invocations are slow enough to need polling/streaming).
- Internally this is a subprocess call — OpenCode is **not** an ADK agent and is **not** reimplemented inside the agent loop. ADK's job here is only to invoke it as a tool and capture stdout/the diff artifact.
- Pass in the digest-derived relevant files from session state (built in Step 2 of the Repo Ingestor flow) rather than the full source tree, per the PRD's "never send raw AST or full source by default" rule.
- Wrap the call with ADK's built-in retry support (Workflow Runtime) so a transient OpenCode failure doesn't kill the whole session — this directly addresses the PRD's "OpenCode/LLM call failures during live demo" risk.

### Step 4 — Complexity Router as a Workflow Runtime routing node
**What it does:** Decides, based on diff size/scope/validation result, whether to open a PR automatically or fall back to a plan artifact.
**How to implement in ADK:**
- Model this as a **routing/branching node** in the Workflow Runtime graph, not as an LLM judgment call — the inputs (diff line count, files touched, validation pass/fail) are deterministic signals.
- Two branches:
  - **Small/contained diff** → route to the PR Publisher tool (Step 5).
  - **Large/cross-module/failed validation** → route to a "generate plan artifact" tool instead (a plain-text/JSON summary, likely a cheap direct LLM call, not OpenCode).
- Keep this router as a distinct node so it's independently testable — you want to be able to unit-test "given this diff shape, which branch fires" without running the full pipeline.

### Step 5 — PR Publisher as a Tool, gated by Human-in-the-Loop upstream
**What it does:** Commits, pushes to the fork, and opens a cross-repo PR via the GitHub API.
**How to implement in ADK:**
- `publish_pr(fork_ref: str, diff: str, issue_id: str, tool_context: Optional[Context] = None)` as a `FunctionTool`.
- Check ADK's GitHub integration (Tools & Integrations Ecosystem) first — if it covers PR creation directly, use it instead of raw REST calls.
- The **human-in-the-loop confirmation already happened earlier**, at the opt-in step before forking (Step 5 of the PRD's user flow) — don't re-gate here; this tool should fire automatically once the router selects the PR branch.

### Step 6 — Wire it together with session state + tracing
**What it does:** Ensures the digest, fork ref, diff, and routing decision all flow through one coherent session instead of being re-derived at each step.
**How to implement in ADK:**
- Use **session state** as the single source of truth passed via `tool_context` across Steps 2–5.
- Turn on ADK's built-in **tracing** for this agent specifically — this is the piece most likely to fail live (fork races, OpenCode timeouts), so you want visibility into exactly which tool call failed and why, not just a generic error.
- For the rehearsed demo repo/issue, cache a known-good fallback diff/result so a live failure in this chain doesn't sink the demo (per the PRD's mitigation).

### Step 7 — Local testing before integration
**What it does:** Validates the full fork → OpenCode → route → publish chain in isolation.
**How to implement in ADK:**
- Run `adk web` to exercise the Orchestrator agent interactively against a real (throwaway) public repo before wiring it into the RepoRamp frontend.
- Once stable, expose it via `adk api_server` so the frontend can call it as a normal backend endpoint.

---

## 3. Build Order Recommendation
1. Summarizer agent + FunctionTools for clone/parse/digest (cheap model).
2. Issue Explainer agent (cheap model, on-demand only).
3. Orchestrator agent per Section 2 above (strongest model), tested locally against a throwaway repo before demo integration.
4. Wire human-in-the-loop opt-in gate in front of the Orchestrator.
5. Rehearse the one pre-tested happy-path repo/issue combo end-to-end, with tracing on, before demo day.
