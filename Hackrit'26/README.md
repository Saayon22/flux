# RepoRamp — Google ADK Multi-Agent Architecture

Built strictly on **Google ADK (`google-adk`, Python 2.x)**, adhering directly to the specifications in `RepoRamp_ADK_Feature_Spec.md`.

---

## 1. System Overview

RepoRamp automates developer onboarding, repository architecture summarization, GitHub issue triage, and high-stakes automated code resolution.

```
                  +-----------------------------------+
                  |           User Request            |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |      reporamp_root (Coordinator)  |
                  |         Model: Gemma 4            |
                  +-----------------------------------+
                      |             |             |
        +-------------+             |             +--------------+
        |                           |                            |
        v                           v                            v
+-------------------+     +---------------------+     +-----------------------+
|  Summarizer Agent |     | Issue Explainer Agt |     | Human-in-the-Loop Gate|
|   (Gemma 4)       |     |     (Gemma 4)       |     |  (Opt-in Confirmation)|
+-------------------+     +---------------------+     +-----------------------+
        |                           |                            |
        |                           | (Relevant files)           v (Authorized)
        |                           +-----------------> +---------------------+
        |                                               | Orchestrator Agent  |
        v                                               | (Strongest Model:   |
+--------------------+                                  |  Gemini 2.5 Pro)    |
| Graph Digest       |                                  +---------------------+
| (NetworkX, Louvain |                                           |
|  in Session State) |                                           v
+--------------------+                         +-----------------------------------+
                                               | LongRunningFunctionTool: Fork     |
                                               +-----------------------------------+
                                                                 |
                                                                 v
                                               +-----------------------------------+
                                               | FunctionTool: OpenCode Subprocess |
                                               | (With RetryConfig & Fallback Diff)|
                                               +-----------------------------------+
                                                                 |
                                                                 v
                                               +-----------------------------------+
                                               | Complexity Router (Workflow Node) |
                                               +-----------------------------------+
                                                  /                             \
                                      (Small Diff)                               (Large / High-Risk)
                                          /                                         \
                                         v                                           v
                        +----------------------------+             +-----------------------------+
                        | publish_pr Tool            |             | generate_plan_artifact Tool |
                        | (Cross-repo Pull Request)  |             | (Structured Architecture    |
                        +----------------------------+             |  Plan Artifact)             |
                                                                   +-----------------------------+
```

---

## 2. Feature Mapping to Google ADK Primitives

| # | Spec Feature | ADK Primitive | Implementation Details |
|---|---|---|---|
| 1 | Modular Multi-Agent System | `google.adk.Agent` | Sub-agents per role: `summarizer_agent`, `issue_explainer_agent`, `orchestrator_agent` |
| 2 | Ingestion & AST Parsing | `google.adk.tools.FunctionTool` | `clone_repo_tool`, `parse_ast_tool`, `build_graph_digest_tool` (NetworkX + Louvain) |
| 3 | GitHub Integration | `google.adk.tools.FunctionTool` | `fetch_issue_tool`, `publish_pr_tool` |
| 4 | Fork Provisioning | `google.adk.tools.LongRunningFunctionTool` | `fork_repo_tool`: yields control asynchronously while GitHub provision completes |
| 5 | Complexity Router | `google.adk.workflow.Workflow` & `FunctionNode` | Deterministic graph routing on line count, files touched, and validation pass/fail |
| 6 | Human-in-the-Loop Opt-In | `ToolContext.request_confirmation` & gate tool | `confirm_handoff_opt_in`: gates orchestrator invocation until user explicitly confirms |
| 7 | Cross-Pipeline State | `ToolContext.state` | Shared session state carries `graph_digest`, `current_issue`, `diff`, `fork_ref` across turns |
| 8 | OpenCode Headless Subprocess | `FunctionTool` + `RetryConfig` | Executes `opencode run --dir <path> --model <model> "<prompt>" --auto` with demo fallback |
| 9 | Tracing & Observability | Structured logging & OpenTelemetry | `tracing.py` logs all multi-agent transitions, fork polls, and subprocess calls |
| 10 | Model Routing | Model-agnostic config / LiteLLM | Gemma 4 (`gemma-4-31b-it`) for cheap roles, strongest model (`gemini-2.5-pro`) for orchestrator |
| 11 | Local Iteration & Serving | `adk web` & `adk api_server` | Packaged as ADK applications in `reporamp` and `orchestrator` |

---

## 3. Directory Layout

```
d:/Hackrit'26/
├── config.py                  # Model routing (Gemma 4 / Gemini) and environment thresholds
├── tracing.py                 # Structured logging and OpenTelemetry tracing
├── agent.py                   # Root multi-agent coordinator (reporamp_root)
├── reporamp/                  # ADK CLI package for full multi-agent assistant
│   ├── __init__.py
│   └── agent.py               # Exposes root_agent for `adk web reporamp`
├── orchestrator/              # ADK CLI package for standalone orchestrator
│   ├── __init__.py
│   └── agent.py               # Exposes root_agent for `adk web orchestrator`
├── agents/
│   ├── __init__.py
│   ├── summarizer_agent.py    # Summarizer agent (Gemma 4)
│   ├── issue_explainer_agent.py # Issue Explainer agent (Gemma 4)
│   └── orchestrator_agent.py  # Orchestrator agent (Gemini 2.5 Pro / Gemma 4)
├── tools/
│   ├── __init__.py
│   ├── ingest_tools.py        # clone_repo, parse_ast, build_graph_digest
│   ├── github_tools.py        # fetch_issue, fork_repo (LongRunning), publish_pr
│   └── opencode_tool.py       # run_opencode (with RetryConfig & demo fallback)
├── workflow/
│   ├── __init__.py
│   ├── complexity_router.py   # Deterministic complexity routing node (pr vs plan)
│   └── handoff_workflow.py    # ADK Workflow graph connecting all handoff steps
└── tests/
    └── test_agents.py         # Comprehensive unit & integration test suite
```

---

## 4. Running the Agent

### A. Development Web UI (`adk web`)
Launch the interactive ADK Web UI:
```bash
adk web reporamp
```
Or run the standalone Orchestrator Web UI:
```bash
adk web orchestrator
```

### B. Headless / API Server Mode (`adk api_server`)
Expose the agents as a FastAPI backend endpoint:
```bash
adk api_server reporamp --port 8000
```

### C. Command Line Interactive Mode (`adk run`)
Interact with the multi-agent system from the terminal:
```bash
adk run reporamp
```
Or execute a single turn query:
```bash
adk run reporamp "Summarize the repository structure"
```

### D. Running Automated Tests
```bash
python -m pytest tests/test_agents.py -v
```
All 8 test suites validate:
- AST extraction and Louvain community detection
- Long-running async GitHub fork tool
- OpenCode headless invocation with fallback
- Complexity Router deterministic branching
- Plan artifact generation
- Human-in-the-Loop confirmation gate
- Multi-Agent coordination and session state flow
- Workflow graph edge compilation
