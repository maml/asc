# ASC V1 — Testing & Seed Data Strategy

## The Reality Check

The ASC is fundamentally a **coordination layer** — it sits between agents, not inside them. It doesn't run agents. It:
- **Receives** requests ("I need a research task done")
- **Routes** them to registered agent providers
- **Tracks** the interaction (traces, latency, cost)
- **Validates** output quality
- **Meters** usage and generates billing events

The V1 is really an **API + dashboard** that manages the lifecycle of agent coordination events.

---

## Testing Layers

### Layer 1: Fully Mockable (No External Services Needed) — ~70-80% of V1

These features can be built and tested entirely with seed data and mocked agent providers:

- **Agent Registry** — Seed with fake providers ("Acme Research Agent", "FastCode Code Agent", etc.) with capability descriptions, pricing, SLA commitments
- **Routing Engine** — Rules-based routing against the seed registry. Pure internal logic.
- **SLA Monitoring** — Simulated events with timestamps. Generate fake latency/accuracy data, test alerting when SLAs breach
- **Billing & Metering** — Coordination events are just database records. Generate synthetically, test invoicing, cost attribution, usage dashboards
- **Observability Dashboard** — Ingest synthetic trace data (OpenTelemetry format). Build the UI against that
- **Circuit Breakers** — Simulate degradation. "Provider X starts returning 500s" — test that routing shifts away

### Layer 2: Simulated Agent Providers (Lightweight, Controlled)

Build 2-3 **tiny fake agent services** that act like real agent providers:

```
POST /agents/acme-research/invoke
→ Accepts a task payload
→ Waits a random delay (simulating real latency)
→ Returns a canned response (or calls an LLM if you want)
→ Sometimes fails (configurable error rate)
→ Reports token usage
```

Simple HTTP services, 50-100 lines each. They test:
- Full request lifecycle end-to-end
- Handoff protocols (does the coordinator correctly pass context?)
- Failure handling (what happens when an agent times out?)
- Multi-agent workflows (Agent A output feeds into Agent B)

### Layer 3: Real LLM Calls (Optional, Low Cost)

Make simulated agents call a cheap LLM under the hood:
- **Claude Haiku** or **GPT-4o-mini** for cheap, real responses
- Real token counts for billing accuracy testing
- Real latency variance
- Real output to test quality gates against

Cost: ~$5-20 for a full test suite run. Optional for V1.

### Layer 4: Real External Agent Services (Defer to V2+)

Actually integrating with Salesforce Agentforce, real CrewAI deployments, etc. requires partner agreements, real API credentials, dealing with rate limits, costs, auth flows. Not needed for V1.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  ASC Platform (the actual product)          │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Registry │ │ Router   │ │ Observability│ │
│  │ + API    │ │ + Engine │ │ + Dashboard  │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ SLA Mgmt │ │ Billing  │ │ Quality     │ │
│  │          │ │ + Meter  │ │ Gates       │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ Provider Interface
          ┌────────┼────────┐
          ▼        ▼        ▼
   ┌──────────┐ ┌──────┐ ┌──────────┐
   │ Sim Agent│ │ Sim  │ │ Sim Agent│
   │ Research │ │ Code │ │ Analysis │
   │ (mock)   │ │(mock)│ │ (mock)   │
   └──────────┘ └──────┘ └──────────┘
```

The **Provider Interface** is the key abstraction. Simulated agents implement it today, real providers implement it tomorrow.

---

## Seed Data Plan

1. **3-5 simulated agent providers** with different capabilities, pricing, latency profiles, and reliability characteristics
2. **A few hundred synthetic coordination events** (past history) to populate dashboards and test SLA tracking
3. **A handful of multi-step workflow templates** (e.g., "research → summarize → review") to test chained agent coordination
4. **Sample SLA definitions** (gold/silver/bronze tiers with different latency and accuracy commitments)

## What This Lets You Demo

- Register an agent provider, see it in the registry
- Submit a coordination request, watch it route to the right agent
- See the trace in the observability dashboard
- Watch the SLA tracker flag a breach when a simulated agent is slow
- See billing events accumulate and generate an invoice
- Trigger a circuit breaker by making a simulated agent fail repeatedly

All fully testable without touching a real external service.

---

## Key Unknowns

| Unknown | Risk Level | Mitigation |
|---------|-----------|------------|
| What does the Provider Interface actually look like? | Medium | Study A2A Agent Cards + design a minimal contract. Iterate once you talk to real providers. |
| Will real agent providers conform to any standard? | High | Build adapters. The interface is yours; adapters translate per-provider. This is the Stripe model. |
| What does "quality validation" actually mean in practice? | High | Start simple — schema validation, response format checks, token budget enforcement. Defer semantic quality. |
| Will enterprises actually pay for this? | High | The research says yes, but validate with conversations before building too much. |
| Cross-org identity/trust — how does mTLS work for agents? | Very High | Defer real cross-org trust to V2. V1 can use API keys with the coordinator as the trust anchor. |

*Strategy document, February 23, 2026.*
