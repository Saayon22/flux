# flux — Hackathon Tech Stack

## Overview

flux will use a simple hackathon-scale architecture focused on shipping the complete MVP rather than introducing unnecessary infrastructure.

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | Next.js + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend | FastAPI + Python |
| Code Parsing | Tree-sitter |
| Dependency Graph | NetworkX |
| LLM | Google Gemini API (google-genai) |
| Autonomous Agent System | Google ADK (Agent Development Kit) |
| GitHub Integration | GitHub REST API |
| Database | SQLite |
| Graph Visualization | React Flow |
| Repository Workspace | Local filesystem |
| Deployment | Vercel + Render/Railway |

## Architecture

```text
Next.js
   │
   │ REST API
   ▼
FastAPI
   │
   ├── GitHub API
   │
   ├── Repository Cloner
   │
   ├── Tree-sitter
   │       ↓
   │   NetworkX Graph
   │
   └── Google ADK Multi-Agent System (Coordinator + Subagents)
           ├── Summarizer Agent (Gemini)
           ├── Issue Explainer Agent (Gemini)
           └── Orchestrator Agent (Gemini + Code Tools)
                   ↓
               Git Diff
                   ↓
               Complexity Router
                   ├── Contained Diff → GitHub PR
                   └── Complex Diff → Implementation Plan Artifact
```

## Backend Components

The FastAPI backend contains the core flux pipeline and Google ADK agents:

```text
backend/
├── main.py
├── api/
│   ├── repos.py
│   ├── graph.py
│   ├── understand.py
│   ├── issues.py
│   └── agent.py
├── agent/
│   ├── coordinator.py      (flux_root Google ADK coordinator)
│   ├── runner.py           (ADK execution engine & handoff)
│   ├── agents/             (summarizer, issue explainer, orchestrator)
│   ├── tools/              (github, ingest, code synthesis & editor tools)
│   └── workflow/           (complexity router, handoff workflow)
├── services/
│   ├── github.py
│   ├── repo_ingestor.py
│   ├── parser.py
│   ├── graph.py
│   ├── digest.py
│   ├── llm.py
│   └── issue_explainer.py
├── models/
└── workspaces/
```

### Responsibilities

- **GitHub service** — repositories, issues, forks, commits and pull requests
- **Repo ingestor** — clones and reads repository documentation
- **Parser** — extracts source-code structure using Tree-sitter
- **Graph service** — builds the dependency graph with NetworkX
- **Digest builder** — converts graph information into compact context for the LLM
- **LLM service** — generates repository summaries and issue explanations via Google Gemini
- **Issue service** — fetches and filters GitHub issues
- **Agent service** — orchestrates Google ADK agents for autonomous code resolution
- **PR service** — commits, pushes and opens pull requests


## Frontend

The frontend will be a single Next.js application.

```text
frontend/
└── Next.js
    ├── Repository input
    ├── Repository overview
    ├── Dependency graph
    ├── Issue explorer
    ├── Issue explanation
    ├── Agent handoff
    └── PR / plan result
```

## What We Are Not Using

To keep the implementation simple at hackathon scale, do **not** introduce:

- Redis
- Kafka
- Kubernetes
- Microservices
- Neo4j
- Vector databases
- Separate worker infrastructure
- LangChain/LangGraph unless a feature specifically requires it

A single FastAPI backend can orchestrate the complete pipeline.

## MVP Stack

The final MVP stack is:

**Next.js + TypeScript + Tailwind/shadcn  
→ FastAPI + Python  
→ Tree-sitter + NetworkX  
→ Google Gemini API (`google-genai`)  
→ Google ADK (Agent Development Kit)  
→ GitHub REST API  
→ SQLite**

## Design Principle

Prioritize a reliable end-to-end demo over infrastructure complexity:

```text
GitHub URL
    ↓
Repository Understanding
    ↓
Dependency Graph
    ↓
Issue Explanation
    ↓
Agent Handoff
    ↓
Code Diff
    ↓
PR or Implementation Plan
```
