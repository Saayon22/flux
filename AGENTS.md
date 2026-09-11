# AGENTS.md

## flux

Follow `flux_PRD.md`.

* Keep the implementation simple and hackathon-scale.
* Stack: Next.js + TypeScript, FastAPI + Python, Tree-sitter, NetworkX, React Flow, Google ADK (Agent Development Kit), Google Gemini API (`google-genai`), GitHub API, SQLite.
* Preserve the flow: **Repo → Graph → Understanding → Issue → Agent → PR/Plan**.
* Use Tree-sitter + NetworkX for grounded repository analysis.
* Use Google ADK multi-agent framework (`flux_root` coordinator, `summarizer_agent`, `issue_explainer_agent`, `orchestrator_agent`).
* Use Google Gemini for grounded summaries, issue triage, and autonomous code patch synthesis.
* Keep cloned repositories in `workspaces/`.
* Require Human-in-the-Loop opt-in before executing autonomous code handoff.
* Avoid unnecessary dependencies and infrastructure.


