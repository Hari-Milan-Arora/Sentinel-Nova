<div align="center">

# 🚀 Sentinel Nova
### Autonomous AI Chief of Staff with Deliberative Reasoning & Cryptographic Safety

*The AI that thinks, verifies, and binds before it acts.*

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=flat-square)](https://github.com/Hari-Milan-Arora/Sentinel-Nova)
[![Tests](https://img.shields.io/badge/Tests-308%20Passed%20%7C%200%20Failed-success?style=flat-square)](./docs/TEST_RESULTS.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node.js-22.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Live Demo](https://aeaas-sentinel-nova-573426129510.asia-southeast1.run.app) • [Research Paper Dataset](./docs/RESEARCH_PAPER_DATA.md) • [Test Suite Report](./docs/TEST_RESULTS.md)

</div>

---

## 📌 Overview

**Sentinel Nova** is a production-grade **AI Chief of Staff** designed to bridge the alignment, safety, and reliability gap in autonomous personal productivity systems. 

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

---

## 📊 Comprehensive Test Suite & Benchmark Results

Sentinel Nova undergoes continuous end-to-end verification across **308 automated test assertions** executed on a TypeScript 5.8 runtime:

| Suite | Component / Agent | Assertions | Passed | Failed | Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **Suite 1** | Chief of Staff End-to-End Workflow (`chiefOfStaffWorkflow.test.ts`) | 60 | 60 | 0 | 🟢 100% |
| **Suite 2** | Availability-Aware Scheduler Agent (`schedulerAgentDay5C4.test.ts`) | 61 | 61 | 0 | 🟢 100% |
| **Suite 3** | Safety Reviewer & Parameter Binding (`reviewerAgent.test.ts`) | 50 | 50 | 0 | 🟢 100% |
| **Suite 4** | Tool Manager & 11 Hostile Attack Vectors (`toolManager.test.ts`) | 107 | 107 | 0 | 🟢 100% |
| **Suite 5** | Multi-Agent Orchestrator Runtime (`orchestrator.test.ts`) | 30 | 30 | 0 | 🟢 100% |
| **Total** | **Comprehensive System Verification** | **308** | **308** | **0** | **🟢 100% PASS** |

👉 **Read the full [Automated Test Suite Report](./docs/TEST_RESULTS.md)** for detailed breakdowns of the 11 security attacks, latency profiles, and edge-case verifications.

---

## 🔬 Academic Research Dataset

Sentinel Nova includes an extensive dataset compiled across $N = 1,000$ standardized test scenarios comparing Sentinel Nova against raw zero-shot LLMs and unconstrained ReAct loops.

### Key Benchmark Metrics
- **Hard Constraint Violations**: **0.0%** for Sentinel Nova vs **24.6%** for raw LLM.
- **Schedule Feasibility Rate**: **99.6%** vs **71.2%** baseline.
- **Parameter Tamper Interception**: **100%** detection via cryptographic HMAC-SHA256 bindings.
- **Runaway Loop Rate**: **0.0%** (guaranteed bounded halting at $k \le 2$).

👉 **Review the complete [Empirical Research Dataset & Mathematical Formulations](./docs/RESEARCH_PAPER_DATA.md)** for formal theorems, statistical significance calculations ($p < 0.0001$), ablation tables, and BibTeX citations.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend Runtime**: Node.js 22, Express, TypeScript (`tsx` execution)
- **AI & Reasoning**: Google Gemini 2.5 Flash via modern `@google/genai` TypeScript SDK
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
- Google Gemini API Key (`GEMINI_API_KEY`)

### 1. Installation
```bash
git clone https://github.com/Hari-Milan-Arora/Sentinel-Nova.git
cd Sentinel-Nova
npm install
```

### 2. Environment Setup
Create a `.env` file in the project root:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Run Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000` to access the Sentinel Nova workspace.

### 4. Run the Test Suites
```bash
# Run Chief of Staff deliberative loop tests
npx tsx server/agents/tests/chiefOfStaffWorkflow.test.ts

# Run Scheduler multi-strategy tests
npx tsx server/agents/tests/schedulerAgentDay5C4.test.ts

# Run Safety Reviewer tests
npx tsx server/agents/tests/reviewerAgent.test.ts

# Run Tool Manager & 11 Hostile Attacks
npx tsx server/agents/tests/toolManager.test.ts

# Run Orchestrator foundation tests
npx tsx server/agents/tests/orchestrator.test.ts
```

---

## 👨‍💻 Author

**Hari Milan Arora**  
AI Engineer & Full-Stack Developer  
*Building verifiable, deliberative multi-agent systems that solve complex real-world productivity challenges.*  
GitHub: [@Hari-Milan-Arora](https://github.com/Hari-Milan-Arora)

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
