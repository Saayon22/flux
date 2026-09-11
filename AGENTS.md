# AGENTS.md

## flux

Follow the `flux_PRD.md` and `flux_Tech_Stack.md` and `flux_Phase_Build_Plan.md`.

* Keep the implementation simple and hackathon-scale.
* Stack: Next.js + TypeScript, FastAPI + Python, Tree-sitter, NetworkX, React Flow, OpenAI API, OpenCode, GitHub API, SQLite.
* Preserve the flow: **Repo → Graph → Understanding → Issue → Agent → PR/Plan**.
* Use Tree-sitter + NetworkX for grounded repository analysis.
* Use OpenAI for summaries/explanations; OpenCode only for code changes.
* Keep cloned repositories in `workspaces/`.
* Avoid unnecessary dependencies and infrastructure.
* Prioritize the MVP and working end-to-end demo.
