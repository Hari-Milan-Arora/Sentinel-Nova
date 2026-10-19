<div align="center">

# 🚀 Sentinel Nova
### Deliberative AI Chief of Staff with Human-Confirmed Actions

*The AI that thinks, verifies, and binds before it acts.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node.js-22.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Live Demo](https://aeaas-sentinel-nova-573426129510.asia-southeast1.run.app) • [ML methodology](./docs/ML_DATASET_METHOD.md) • [AI/ML/LLM status](./docs/AI_ML_LLM_ROOT_CAUSE.md)

</div>

---

## 📌 Overview

**Sentinel Nova** is an actively developed **AI Chief of Staff** for task planning, prioritization, and human-confirmed actions. Its deterministic planning and scheduling layers remain authoritative; Gemini provides optional language interpretation and explanation when configured.

Unlike traditional chatbot assistants that hallucinate deadlines or unconstrained ReAct agents that blindly mutate external calendars, Sentinel Nova introduces a **deliberative multi-agent architecture** where:
1. **Mathematical Determinism Anchors AI Reasoning**: Prioritization and scheduling combine multi-factor objective scoring with LLM semantic explanation.
2. **Cryptographic Parameter Binding Eliminates Tampering**: Actions reviewed and approved by the Safety Gate are signed with a canonical SHA-256 hash and a 5-minute TTL. Altering any parameter between review and execution triggers an immediate abort.
3. **Bounded Recovery Loops Prevent Cascades**: Self-healing recovery is mathematically capped at $k \le 2$ cycles to avoid infinite retry storms.
4. **Google Calendar Read-Only Guarantee**: External user calendars are strictly treated as read-only availability inputs; calendar mutation tools are prohibited by design.

---

## 🏗️ System Architecture

```
                               ┌───────────────────────────────────────────────┐
                               │           User Interaction Layer              │
                               │   React 19 + TypeScript + Tailwind SPA UI    │
                               └──────────────────────┬────────────────────────┘
                                                      │ Intent & Requests
                                                      ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     Chief of Staff Multi-Agent Runtime                                  │
│                                            (NovaOrchestrator)                                          │
│                                                                                                        │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │   ContextInspectorAgent │   │     PrioritizerAgent     │   │            PlannerAgent             │  │
│  │  - Context extraction   │   │  - 7-Factor Scoring      │   │  - Goal / Project Decomposition     │  │
│  │  - Active state telemetry│  │  - Gemini Flash Rationale│   │  - Sprint & Horizon Allocation      │  │
│  └─────────────────────────┘   └──────────────────────────┘   └─────────────────────────────────────┘  │
│                                                                                                        │
│  ┌─────────────────────────┐   ┌──────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │       MemoryAgent       │   │      SchedulerAgent      │   │            RecoveryAgent            │  │
│  │  - Privacy-scoped RAG   │   │  - Availability Engine   │   │  - Diagnostic failure analysis      │  │
│  │  - PII / Secret scrubbing│  │  - 5-Strategy Deliberation│  │  - Bounded cycles (k <= 2)          │  │
│  └─────────────────────────┘   └──────────────────────────┘   └─────────────────────────────────────┘  │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │ Action Proposal (SCHEDULE / COMPLETE / REOPEN)
                                                    ▼
                       ┌─────────────────────────────────────────────────────────┐
                       │                   ReviewerAgent Gate                    │
                       │  - Hard Constraint Feasibility (Sleep & Fixed Blocks)   │
                       │  - Chronological Integrity (start < end)                │
                       │  - Strict Multi-Tenant Isolation                        │
                       │  - SHA-256 Parameter Hash Binding Generation (5-min TTL)│
                       └────────────────────────────┬────────────────────────────┘
                                                    │
                                  ┌─────────────────┴─────────────────┐
                 [Rejected / Tampered]│                               │[Approved & Confirmed]
                                      ▼                               ▼
                      ┌───────────────────────────────┐  ┌───────────────────────────────┐
                      │    Safe Workflow Abort        │  │       ToolManager Registry    │
                      │  - Zero mutation of state     │  │  - tool.task.schedule         │
                      │  - Telemetry trace audit      │  │  - tool.task.complete         │
                      │  - Trigger RecoveryAgent      │  │  - tool.task.reopen           │
                      └───────────────────────────────┘  │  - Zero Google Calendar writes│
                                                         └───────────────┬───────────────┘
                                                                         │
                                                                         ▼
                                                         ┌───────────────────────────────┐
                                                         │       Persistent Store        │
                                                         │ Tasks • Goals • Projects • Mem│
                                                         └───────────────────────────────┘
```

---

## ✨ Core Pillars & Agent Specialization

### 1. ⚡ PrioritizerAgent (7-Factor Scoring Engine)
Evaluates tasks against a normalized linear objective function:
$$S(T_j) = \sum_{k=1}^7 w_k \cdot \phi_k(T_j)$$
Incorporates **Urgency**, **Goal Alignment**, **Dependency Closeness**, **Cognitive Energy Match**, **Momentum**, **Focus Rhythm**, and **Habit Velocity**, paired with Gemini 2.5 Flash for natural language rationales.

### 2. 📅 SchedulerAgent & Availability Engine
Merges user sleep schedules, fixed recurring commitments, and Google Calendar busy intervals into hard protected blocks. Deliberates across 5 distinct scheduling strategies:
- `deadline_first`: Minimizes slack time before hard deadlines.
- `focus_alignment`: Places high-effort cognitive tasks into uninterrupted deep-work windows.
- `balanced_day`: Evenly distributes workload with generous buffer spacing.
- `energy_match`: Aligns demanding tasks with peak circadian energy rhythm.
- `workload_balance`: Optimizes sustainable daily throughput.

### 3. 🛡️ ReviewerAgent & Cryptographic Parameter Binding
Acts as the mandatory security gate before any action proposal can reach user confirmation or execution. It cryptographically binds the proposal parameters using SHA-256:
- **Anti-Tampering**: Intercepts parameter manipulation during the confirmation phase.
- **Strict Tenant Isolation**: Prevents cross-user task targeting and identity spoofing.
- **Chronological Verification**: Enforces $t_{\text{start}} < t_{\text{end}}$ and eliminates sleep rhythm collisions.

### 4. 🔄 RecoveryAgent & Bounded Self-Healing
If tool execution encounters a transient storage conflict or external constraint failure, the `RecoveryAgent` performs diagnostic root-cause analysis, evaluates alternatives, and suggests adjustments—strictly bounded at $k \le 2$ cycles to avoid infinite runaway loops.

### 5. 🧠 MemoryAgent (Privacy-Preserving Retrieval)
Provides context-aware semantic retrieval of user preferences, scheduling habits, and past commitments with automatic PII and credential scrubbing.

### 6. 💬 Chief-of-Staff UX & Conversational Orchestration (Day 5D)
A command center interface built on top of the `ChiefOfStaffWorkflowEngine`:
- **Deliberative Reasoning Summaries**: Explains why tasks are chosen without fake thinking delays or hidden prompt tokens.
- **Structured Recommendation Cards**: Presents priority, confidence percentages, why-this-now rationale, and alternatives.
- **Action Proposal & Cryptographic Confirmation Cards**: Enforces the human-in-the-loop principle (`[Confirm & Execute]`, `[Edit]`, `[Reject]`).
- **Plan My Day Experience**: Dynamically generates cohesive schedules with focus blocks, calendar event awareness, and cognitive buffers.
- **Conversational Context Continuity & Disambiguation**: Tracks references like "this task" and provides multi-choice disambiguation prompts when queries are ambiguous.

### 7. 🛡️ Intelligence Validation & Production Hardening (Day 6)
Rigorous adversarial testing, multi-factor reasoning verification, and production safety hardening:
- **13 Real-World Scenario Matrix**: Deterministic verification of overloaded days, meeting conflicts, deadline proximities, dependency blocks, tie-breaking, insufficient capacity, sleep boundaries, empty goals/projects, and candidate window ranking.
- **15 Contextual Reasoning Factors (A–O)**: Validates that urgency, importance, goal impact, project impact, blocking impact, effort, capacity, focus periods, cognitive load, dependencies, calendar availability, sleep, and user planning preferences actively drive decisions.
- **Pre-Confirmation & Pre-Execution Proposal Staleness Protection**: Real-time validation intercepting stale proposals if underlying tasks were completed/deleted or calendar events were added after proposal generation.
- **Strict Concurrency Mutual Exclusion**: Atomic synchronous state claims preventing duplicate or race-condition confirmations.

---

## ✅ Verification

The repository provides isolated commands for outcome capture, ML inference, prediction heuristics, LLM response handling, workflow behavior, lint, and production build. Run the commands in the current `package.json`; older assertion totals and benchmark claims are not release evidence. See [AI/ML/LLM root-cause and status](./docs/AI_ML_LLM_ROOT_CAUSE.md) and [ML dataset methodology](./docs/ML_DATASET_METHOD.md) for the current measured status and limitations.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend Runtime**: Node.js 22, Express, TypeScript (`tsx` execution)
- **AI & Reasoning**: Optional server-side Google Gemini integration through `@google/genai`; live credentials are required for provider verification
- **Architecture**: Stateful Deliberative Multi-Agent State Machine (`ChiefOfStaffWorkflowEngine`)
- **Security & Data**: In-memory & JSON file persistent stores with per-tenant isolation, SHA-256 cryptographic parameter verification

---

## 📂 Repository Structure

```
Sentinel-Nova/
├── docs/
│   ├── RESEARCH_PAPER_DATA.md    # Formal mathematical models, benchmarks & ablation study
│   └── TEST_RESULTS.md           # 308 automated test assertion reports & attack audit
├── server/
│   ├── agents/
│   │   ├── agents/               # Specialized AI agents (Prioritizer, Scheduler, Reviewer, etc.)
│   │   ├── services/             # Gemini model router, reasoning services & rate limiter
│   │   ├── tests/                # 15+ automated agent and workflow test suites
│   │   ├── tools/                # ToolManager, ToolRegistry, safe Task execution tools
│   │   ├── workflow/             # ChiefOfStaffWorkflowEngine, state machine & bindings
│   │   ├── Agent.ts              # BaseAgent abstract class
│   │   ├── AgentRegistry.ts      # Capability-based agent discovery
│   │   └── NovaOrchestrator.ts   # Multi-agent dispatcher & trace recorder
│   ├── calendarStore.ts          # Read-only calendar store & event normalizer
│   ├── memoryStore.ts            # Privacy-scoped semantic memory store
│   ├── profileStore.ts           # User rhythm & recurring commitment store
│   ├── taskStore.ts              # Task CRUD, status lifecycle & persistence
│   └── server.ts                 # Express backend & API endpoint router
├── src/
│   ├── auth/                     # Client authentication context & protected routes
│   ├── components/               # Modals, task rows, schedule timelines, quick-add bar
│   ├── context/                  # TaskContext, GoalContext, CalendarContext
│   ├── pages/                    # AI Workspace, Dashboard, Calendar, Tasks, Goals, Settings
│   └── utils/                    # AvailabilityEngine, PredictionEngine, schedule utilities
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js $\ge$ 20.x
- Python 3.10+ and the dependencies in `ml/requirements.txt` are needed only for offline ML artifact tests/inference.
- Google OAuth web client ID and a long random `AUTH_SECRET` are needed for authenticated app use.
- `GEMINI_API_KEY` is optional; without it, Gemini-backed enhancements are unavailable and supported deterministic workflows remain available.

### 1. Installation
```bash
git clone https://github.com/Hari-Milan-Arora/Sentinel-Nova.git
cd Sentinel-Nova
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env`, then set `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, and `AUTH_SECRET`. Use the same Google OAuth **Web application** client ID for both client ID variables, and in Google Cloud Console add `http://localhost:3000` under that client’s **Authorized JavaScript origins**. Google Identity Services sign-in cannot initialize if the origin is not authorized; local readiness checks cannot inspect the Cloud Console setting. Add `http://127.0.0.1:3000` too only if you open the app using that host. Add `GEMINI_API_KEY` only if you want Gemini features. Keep `.env` private and do not place server credentials in `VITE_*` variables.

### 3. Run Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000` to access the Sentinel Nova workspace.

On Windows, `Open-Sentinel-Nova.bat` checks configuration, dependencies, and both development ports, then opens the API and Vite frontend in separate Command Prompt windows. The split setup serves the frontend at `http://localhost:3000` and proxies `/api` to the API at `http://localhost:3001`. If the readiness check fails, it lists the configuration or setup items to fix. `npm run check:ready` runs the same local checks; `npm run smoke:gemini` makes one small live provider request and reports only a sanitized status.

### 4. Run tests and checks
```bash
npm run test:isolation
npm run test:ml:outcomes:http
npm run test:ml:outcomes
npm run test:ml:integration
npm run test:ml
npm run test:prediction
npm run test:llm
npm test
npm run lint
npm run build
```

The default JSON store is `data/` (override with `SENTINEL_NOVA_DATA_DIR`). It is local, unencrypted, and supports one server process only. Do not share it across workers or instances. Outcome collection is opt-in and remains disabled until a user enables it; verify OS-level permissions on the deployment host before collecting real records. The experimental Jira lead-time model remains disabled by default.

---

## 👨‍💻 Author

**Hari Milan Arora**  
AI Engineer & Full-Stack Developer  
*Building verifiable, deliberative multi-agent systems that solve complex real-world productivity challenges.*  
GitHub: [@Hari-Milan-Arora](https://github.com/Hari-Milan-Arora)

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
