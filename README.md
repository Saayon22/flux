# flux

> **Grounded Open-Source Onboarding & Autonomous Agentic Issue Resolution**  
> *From GitHub URL to AST Dependency Graph, Grounded Issue Triage, and Google ADK Autonomous Pull Requests.*

---

## Overview

New open-source contributors often spend days or weeks attempting to understand unfamiliar codebases, deciphering vague `good-first-issue` labels, and figuring out what code actually needs to change.

**flux** solves this problem by taking any GitHub repository, generating a deterministic source code dependency graph via **Tree-sitter** and **NetworkX**, synthesizing a grounded architectural understanding with **Google Gemini**, and providing an autonomous multi-agent handoff via **Google ADK (Agent Development Kit)** that opens a cross-repository pull request or creates a structured implementation plan.

---

## Core Pipeline

```text
GitHub URL
    ↓
Tree-sitter Parsing + NetworkX Dependency Graph
    ↓
Grounded Repository Understanding (Architecture, Feature Map, Flows)
    ↓
Issue Discovery & 1-Hop Graph Neighborhood Triage
    ↓
Human-in-the-Loop Opt-In Confirmation Gate
    ↓
Google ADK Orchestrator Agent (Lazy Forking + Code Patch Synthesis)
    ↓
Deterministic Complexity Router
    ├── Contained Diff (<= 150 lines, <= 4 files) ──> Cross-Repo GitHub Pull Request
    └── Complex Diff (> 150 lines or cross-module)  ──> Structured Implementation Plan Artifact
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) (Python 3.12) |
| **AST Parsing** | [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) (Python & JavaScript/TypeScript grammars) |
| **Dependency Graph** | [NetworkX](https://networkx.org/) (in-degree, out-degree, Louvain community clusters) |
| **Agent Framework** | [Google ADK](https://pypi.org/project/google-adk/) (`google-adk` 2.9.0) |
| **Language Model & SDK** | [Google Gemini](https://ai.google.dev/) (`gemini-3.6-flash` via `google-genai` SDK) |
| **Database** | SQLite (`flux.db`) via synchronous/asynchronous SQLite drivers |
| **VCS & API** | GitHub REST API v3 (forks, issues, pull requests, commits) |

---

## Google ADK Multi-Agent Architecture

flux implements a hierarchical multi-agent system powered by **Google ADK**:

```text
                  ┌──────────────────────────────┐
                  │          flux_root           │
                  │   Coordinator Agent (ADK)    │
                  └──────────────┬───────────────┘
                                 │
         ┌───────────────────────┼────────────────────────┐
         ▼                       ▼                        ▼
┌──────────────────┐   ┌───────────────────┐   ┌─────────────────────┐
│ summarizer_agent │   │ issue_explainer   │   │ orchestrator_agent  │
│  Architecture &  │   │  1-Hop Neighborhood│   │   (Gated Opt-In)    │
│  Graph Digests   │   │  Issue Triage     │   │ Lazy Fork + Patch   │
└──────────────────┘   └───────────────────┘   └──────────┬──────────┘
                                                          │
                                               ┌──────────┴──────────┐
                                               ▼                     ▼
                                       Complexity Router     Complexity Router
                                        (Contained Diff)      (Complex Diff)
                                               │                     │
                                               ▼                     ▼
                                       GitHub Pull Request   Implementation Plan
```

1. **`flux_root` (Coordinator Agent)**: Manages conversational sessions and routes developer queries to specialized sub-agents.
2. **`summarizer_agent`**: Analyzes the Tree-sitter graph metrics, central files, and documentation highlights to synthesize comprehensive repository summaries and feature maps.
3. **`issue_explainer_agent`**: Maps GitHub issues to a 1-hop graph neighborhood, generating plain-English explanations, real-world analogies, and concrete file checklists.
4. **`orchestrator_agent`**: Owns the high-stakes code handoff. Gated behind an explicit **Human-in-the-Loop opt-in gate**, it lazily provisions a fork, synthesizes clean unified diff patches, and routes through the **Complexity Router** to either publish a GitHub PR or produce an actionable Implementation Plan.

---

## Project Structure

```text
flux/
├── backend/
│   ├── main.py                     # FastAPI application entrypoint
│   ├── config.py                   # Pydantic settings & environment configuration
│   ├── requirements.txt            # Python dependencies
│   ├── agent/                      # Google ADK multi-agent package
│   │   ├── coordinator.py          # flux_root coordinator agent
│   │   ├── runner.py               # ADK interactive runner & handoff engine
│   │   ├── agents/                 # Specialized sub-agents
│   │   │   ├── summarizer_agent.py
│   │   │   ├── issue_explainer_agent.py
│   │   │   └── orchestrator_agent.py
│   │   ├── tools/                  # ADK function tools
│   │   │   ├── github_tools.py     # Forking, issues, and PR publishing
│   │   │   ├── ingest_tools.py     # Cloning & graph digest tools
│   │   │   ├── opencode_tool.py    # Code patch synthesis & ADK aliases
│   │   │   └── code_editor_tools.py# Local file read/write/edit tools
│   │   └── workflow/               # ADK workflow graph & complexity routing
│   │       ├── complexity_router.py
│   │       └── handoff_workflow.py
│   ├── api/                        # REST API routers
│   │   ├── repos.py                # Repo ingestion & exploration
│   │   ├── graph.py                # AST parsing & NetworkX graph endpoints
│   │   ├── understand.py           # Grounded understanding endpoints
│   │   ├── issues.py               # Issue discovery & explanation
│   │   └── agent.py                # ADK Agent handoff, chat, and status
│   ├── services/                   # Core business logic & parser services
│   ├── models/                     # SQLite database models & Pydantic schemas
│   └── workspaces/                 # Cloned repository filesystem
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Main single-page interactive dashboard
│   │   ├── components/             # React UI components
│   │   │   ├── AgentHandoffModal.tsx # Google ADK Agent handoff & chat modal
│   │   │   ├── GraphView.tsx       # Interactive graph visualization
│   │   │   ├── IssueExplorer.tsx   # Issue discovery & filter list
│   │   │   └── RepoOverview.tsx    # Architecture & feature overview
│   │   └── lib/api.ts              # Frontend API client
│   └── package.json                # Next.js dependencies
├── AGENTS.md                       # Developer & coding agent operating rules
├── flux_PRD.md                     # Product Requirements Document
├── flux_Tech_Stack.md              # Technical Stack Specification
└── flux_Phase_Build_Plan.md        # Phase-wise milestone plan
```

---

## Getting Started

### 1. Prerequisites
- **Python 3.12+**
- **Node.js 18+** / npm
- **Git**

### 2. Environment Configuration
Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and set your Google Gemini API Key and GitHub Personal Access Token:

```ini
# Google Gemini / ADK Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash

# GitHub Token (Optional: elevates rate limits and enables live fork/PR publishing)
GITHUB_TOKEN=your_github_personal_access_token_here
```

### 3. Backend Setup

```bash
cd backend
python -m venv .venv

# On Windows:
.\.venv\Scripts\activate
# On Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend documentation will be accessible at:
- Swagger UI: `http://127.0.0.1:8000/docs`
- Health Check: `http://127.0.0.1:8000/api/health`
- Agent Status: `http://127.0.0.1:8000/api/agent/status`

### 4. Frontend Setup

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Running the Verification Suite

Run all 17 automated test suites against the backend:

```bash
# From repository root (or inside backend/)
.\backend\.venv\Scripts\python.exe -m pytest backend/ -v
```

Or run individual integration test modules:

```bash
# Phase 7 & 8 End-to-End Suite (Complexity Routing, SQLite, Rate Limit & Demo Rehearsal):
.\backend\.venv\Scripts\python.exe backend/test_phase7_phase8_e2e.py

# Agent Status, Opt-In Gate, Handoff & Chat:
.\backend\.venv\Scripts\python.exe backend/test_agent.py

# FastAPI Endpoints & Health:
.\backend\.venv\Scripts\python.exe backend/test_api.py

# Tree-sitter AST & NetworkX Graph:
.\backend\.venv\Scripts\python.exe backend/test_graph.py

# Repository Ingestion & Workspace:
.\backend\.venv\Scripts\python.exe backend/test_ingest.py

# GitHub Issue Discovery & Explanation:
.\backend\.venv\Scripts\python.exe backend/test_issues.py

# Grounded Repository Understanding:
.\backend\.venv\Scripts\python.exe backend/test_understanding.py
```

---

## Live Demo Rehearsal Guide

flux is engineered for zero-touch, seamless live hackathon demonstrations:

1. **System Health Status Bar**:
   - Check the top header for live status of **Gemini 3.6 Flash**, **Google ADK Multi-Agent Framework**, and authenticated **GitHub API Rate Limit** ($5{,}000\text{ req/hr}$).

2. **1-Click Live Rehearsal Pills**:
   - Click `Roxy-06/Eduzen` (Dual-portal AI university system with Python FastAPI backend and React frontend) or `octocat/Hello-World`.
   - The input automatically populates and kicks off the 1-click end-to-end pipeline.

3. **1-Click Full Analysis Auto-Pipeline**:
   - Hit **⚡ 1-Click Full Analysis** to execute:
     `Ingestion` $\to$ `Tree-sitter AST & NetworkX Graph` $\to$ `Gemini Architecture Understanding` sequentially with real-time stepper indicators.

4. **Issue Triage & Google ADK Handoff**:
   - Select an issue from the discovered issue cards.
   - Click **🚀 Handoff to Google ADK Agent**.
   - Review the Human-in-the-Loop opt-in gate and click **Authorize & Execute Handoff**.

5. **Deterministic Complexity Routing**:
   - **Contained fixes ($\le 150$ lines, $\le 4$ files)**: Automatically checks out a local branch, applies the patch, pushes to the authenticated fork, and opens an upstream GitHub Pull Request.
   - **High-complexity fixes ($> 150$ lines or broad modules)**: Generates a structured **Implementation Plan Artifact** with an interactive **📥 Download Plan (.md)** button, affected AST modules, refactoring steps, and QA checklist.

---

## License

MIT License. Built for hackathon and open-source contribution acceleration.
