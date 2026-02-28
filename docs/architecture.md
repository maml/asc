# Architecture

[Back to index](./README.md)

## The Coordination Model

ASC's core abstraction is the **coordination** — a single request from a consumer to get work done by an agent. Here's the hierarchy:

```
Coordination (the envelope)
  └── Task (the execution)
       └── Events (the audit log)
```

### Coordination

Created when a consumer calls `POST /api/coordinations`. It's the top-level record that ties together who's asking (consumer), who's doing the work (agent), and a trace ID for observability. Think of it as a **work order**.

### Task

The actual unit of work. A coordination creates exactly one task (today — multi-task orchestration is a future possibility). The task tracks:

- **Status lifecycle**: `pending` → `in_progress` → `completed` or `failed`
- **Retry logic**: Up to 3 attempts (5 for `critical` priority), with exponential backoff
- **Input/output**: The payload sent to the agent and what came back
- **Timing**: `createdAt`, `startedAt`, `completedAt`

### Events

Lifecycle events emitted as the task progresses. Every state transition produces an event. Event types:

| Event | When |
|-------|------|
| `task_created` | Coordination submitted, task record created |
| `task_started` | Attempt begins (includes attempt number) |
| `task_completed` | Agent returned success, quality gates passed |
| `task_failed` | Agent error or quality gate failure (includes `willRetry` flag) |
| `task_timeout` | Agent didn't respond within `timeoutMs` |
| `task_cancelled` | Consumer cancelled the request |
| `circuit_opened` | Too many failures — circuit breaker tripped for this agent |
| `circuit_closed` | Agent recovered, circuit breaker reset |
| `sla_violation` | Agent breached its SLA contract |

Events are persisted to the `coordination_events` table and also broadcast over [WebSocket](./api-reference.md#websocket-live-events) for real-time consumers like the [Canvas Dashboard](./canvas-dashboard.md).

---

## Request Flow

Here's what happens when you submit a coordination request:

```
Consumer                    ASC Backend                         Agent
   │                            │                                │
   │  POST /api/coordinations   │                                │
   │ ─────────────────────────> │                                │
   │                            │  1. Validate agent exists       │
   │                            │  2. Create coordination record  │
   │                            │  3. Create task record          │
   │                            │  4. Emit task_created event     │
   │  <── 202 Accepted (task) ──│                                │
   │                            │                                │
   │                            │  5. Check circuit breaker       │
   │                            │  6. Emit task_started event     │
   │                            │                                │
   │                            │  POST /invoke                  │
   │                            │ ─────────────────────────────> │
   │                            │                                │
   │                            │  <── { status, output }  ──── │
   │                            │                                │
   │                            │  7. Record success/failure     │
   │                            │  8. Update circuit breaker     │
   │                            │  9. Run quality gates          │
   │                            │  10. Emit task_completed       │
   │                            │  11. Record billing            │
   │                            │  12. Evaluate SLA rules        │
```

Key points:
- The response to the consumer is **immediate** (202). Task execution happens **asynchronously**.
- If the agent fails, ASC retries with exponential backoff (1s, 2s, 4s... up to 10s).
- The [circuit breaker](./architecture.md#circuit-breaker) can short-circuit retries if the agent is known-broken.
- All events are written to DB and broadcast over WebSocket simultaneously.

---

## Circuit Breaker

Each agent gets its own circuit breaker, a state machine that prevents cascading failures:

```
         5 failures in 60s
  ┌────────────────────────────┐
  │                            v
CLOSED ◄──────────────── HALF_OPEN ──────────► OPEN
  │       3 successes         ▲   any failure    │
  │                           │                  │
  │                           └──────────────────┘
  │                            30s recovery timeout
  │
  (normal operation)
```

**States:**

| State | Behavior |
|-------|----------|
| `closed` | Normal. Requests flow through. Failures are counted. |
| `open` | Broken. All requests immediately rejected. Waits 30s before testing. |
| `half_open` | Testing. Lets requests through. 3 successes → closed. Any failure → open. |

**Default thresholds** (configurable per agent):
- Failure threshold: **5 failures** within a 60-second sliding window
- Recovery timeout: **30 seconds** before transitioning to half-open
- Half-open success count: **3 consecutive successes** to fully close

Circuit state changes are broadcast as WebSocket events and visible in real time on the [Canvas Dashboard](./canvas-dashboard.md).

---

## System Components

```
┌─────────┐     REST      ┌──────────────┐    TCP     ┌────────────┐
│Consumer  │ ────────────> │  ASC Backend  │ ────────> │ PostgreSQL │
└─────────┘               │  (port 3100)  │           │ (port 5433)│
                          └──────┬────────┘           └────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    v            v            v
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Echo     │ │  Slow    │ │  Flaky   │
              │  Agent    │ │  Agent   │ │  Agent   │
              │  (:4100)  │ │  (:4200) │ │  (:4300) │
              └──────────┘ └──────────┘ └──────────┘
```

**Backend modules:**

| Module | Responsibility |
|--------|---------------|
| `src/registry/` | CRUD for providers, agents, consumers |
| `src/coordination/` | Task orchestration, circuit breaker, event emission |
| `src/observability/` | Distributed tracing, SLA evaluation, quality gates |
| `src/billing/` | Usage tracking, invoice generation |
| `src/realtime/` | WebSocket broadcasting, system status endpoint |
| `src/db/` | Connection pool, migration runner |
| `src/simulated/` | Test agents (echo, slow, flaky) |

---

## Related

- [API Reference](./api-reference.md) — endpoint details and curl examples
- [Getting Started](./getting-started.md) — running the full stack
- [Canvas Dashboard](./canvas-dashboard.md) — visualizing all of this in real time
