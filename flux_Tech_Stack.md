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
| LLM | OpenAI API |
| Coding Agent | OpenCode |
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
   ├── LLM API
   │
   └── OpenCode
           ↓
       Git Diff
           ↓
       GitHub PR
```

## Backend Components

The FastAPI backend will contain the core flux pipeline:

```text
backend/
├── main.py
├── api/
├── services/
│   ├── github.py
│   ├── repo_ingestor.py
│   ├── parser.py
│   ├── graph.py
│   ├── digest.py
│   ├── llm.py
│   ├── issue.py
│   ├── agent.py
│   └── pr.py
├── models/
└── workspaces/
```

### Responsibilities

- **GitHub service** — repositories, issues, forks, commits and pull requests
- **Repo ingestor** — clones and reads repository documentation
- **Parser** — extracts source-code structure using Tree-sitter
- **Graph service** — builds the dependency graph with NetworkX
- **Digest builder** — converts graph information into compact context for the LLM
- **LLM service** — generates repository summaries and issue explanations
- **Issue service** — fetches and filters GitHub issues
- **Agent service** — invokes OpenCode for code changes
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
→ OpenAI API  
→ OpenCode  
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
