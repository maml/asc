# Agentic Services Coordinator (ASC) — Product Summary

## What the Product Is

**Agentic Services Coordinator (ASC)** — a cross-organizational coordination layer for AI agents. Think "Stripe for agent services."

The core insight: every major platform (CrewAI, LangChain, Salesforce Agentforce, Microsoft, Google Vertex) has optimized for **single-organization** agent orchestration. **Nobody** is solving coordination **between** organizations — where Company A's agents need to discover, interact with, bill, and trust Company B's agents. That's the gap.

The protocols exist (MCP for tool connectivity, A2A for agent-to-agent comms), but they leave out the hard stuff: billing, SLAs, quality validation, trust/reputation, governance, and intelligent routing across org boundaries.

**Target customers**: Enterprises with 10-50+ agents, especially in financial services, healthcare, and logistics/supply chain — industries with high compliance needs and cross-org coordination requirements.

---

## What a V1 App Could Look Like

Based on the research's own prioritization and the "land with observability, expand to coordination" advice:

### Core Features (MVP)

1. **Agent Registry & Discovery** — A unified registry where agent providers register their agents with capability descriptions (leveraging A2A Agent Cards). Consumers search/filter by capability, cost, and quality scores.

2. **Intelligent Routing** — Route requests to the best-fit agent based on capability match, cost, latency, and reliability. Start rules-based, graduate to ML-powered.

3. **Unified Observability Dashboard** — Distributed tracing across multi-agent, multi-provider workflows. The single pane of glass CIOs are desperate for. Canonical log lines for every coordination event.

4. **SLA Definition & Monitoring** — Let consumers define response time, accuracy, and uptime SLAs for agent interactions. Track compliance. Alert on breaches.

5. **Basic Billing & Metering** — Track usage across providers. Generate invoices. Support per-coordination-event billing. This is the feature nobody else has.

6. **Quality Gates** — Automated output validation on agent handoffs. Hallucination detection at trust boundaries. Pass/fail gates before downstream agents consume output.

7. **Circuit Breakers & Failover** — When a provider's agent degrades, auto-route to alternatives. Prevent cascading failures across agent networks.

### What to Defer to V2+
- Cross-org reputation scoring system
- ML-powered routing optimization (start with rules)
- Marketplace / agent exchange features
- Advanced compliance reporting (EU AI Act, HIPAA)
- Multi-party workflow coordination (3+ orgs)
- Agent-mediated billing settlement between orgs
- VPC/on-prem deployment options

---

## Trust & Settlement Architecture (Strategic Direction)

ASC's identity and payment layers are built on Bitcoin's cryptographic primitives — not as an ideological choice, but because they are the only production-grade tools that satisfy all requirements simultaneously.

### Identity: secp256k1 Keypairs + BIP-32 HD Derivation
- Orgs bring their own keypairs (sovereign identity, no central CA dependency)
- ASC acts as trust broker, not trust source — attests to relationships, not identities
- Coordination tokens carry multiple signatures (consumer + ASC routing + provider)
- Any party can verify any other party independently
- HD key derivation enables scoped child keys per agent, per relationship, per purpose

### Settlement: Lightning Network
- Sub-cent micro-payments for per-invocation billing (agents can't hold bank accounts, but can hold keys)
- Atomic settlement tied to task completion via hold invoices (programmable escrow)
- 24/7 borderless operation, no fee floors, no settlement delay
- Stripe/traditional rails remain available for enterprise invoicing

### Why Not Traditional Approaches
- PKI/X.509: central CA dependency, orgs can't self-provision, revocation infrastructure is broken
- OAuth/API keys: no delegation chain verification, shared secrets collapse trust boundaries
- Stripe/ACH: fee floors kill micro-payments, days-long settlement, business-hours dependency, agents can't open bank accounts

See VMP project for full positioning framework: `/Users/mloseke/Documents/Claudeifacts/Sub-Agents/vmp-feb-22-2026/brand/positioning.md`

---

## Suggested Stack

| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| **Language** | TypeScript (Node.js) or Go | TS for developer experience and speed; Go if you want raw performance for the routing/proxy layer. Could do both (Go for the coordination engine, TS for the API/dashboard). |
| **API** | REST + WebSocket/SSE | REST for CRUD operations, WebSocket/SSE for real-time agent status and streaming traces. JSON-RPC 2.0 compatibility for MCP/A2A protocol support. |
| **Database** | PostgreSQL | Reliable, well-understood, handles the relational data (registries, SLAs, billing records, audit trails). |
| **Time-series / Traces** | ClickHouse or TimescaleDB | High-volume ingestion for observability data, traces, and metrics. ClickHouse if you want to go big. |
| **Queue / Events** | Redis Streams or NATS | Event-driven agent coordination requires fast pub/sub. NATS is lightweight and fits the "event mesh" pattern. |
| **Frontend** | Next.js + React | Dashboard for the observability/registry/billing UI. Next.js gives you SSR and API routes in one. |
| **Auth** | secp256k1 keypairs (Bitcoin primitives) + Clerk for dashboard | Sovereign org identity via keypairs, human auth for dashboard UI. ASC as trust broker, not trust issuer. |
| **Settlement** | Lightning Network (LND/CLN) + Stripe fallback | Lightning for agent-to-agent micro-payments (atomic, sub-cent). Stripe for enterprise invoicing. |
| **Deployment** | Docker + Fly.io or Railway initially, then AWS/GCP | Start simple, move to cloud infra as enterprise customers demand VPC deployment. |
| **Tracing** | OpenTelemetry | Industry standard, protocol-agnostic, aligns with the "build on standards" principle. |

---

## The Positioning in One Line

> "The coordination layer between organizations for the agent economy — one integration to connect, route, bill, and govern any agent provider."

*Summary compiled from research at /research/ directory, February 23, 2026.*
