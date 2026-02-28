# Canvas Dashboard

[Back to index](./README.md)

The System Canvas is a real-time node graph at **http://localhost:3200/canvas** that visualizes the full ASC architecture with live data.

## What You're Looking At

The canvas shows the system as an interactive graph built with React Flow:

```
┌─ Consumers ─────────┐                           ┌────────────┐
│  ┌─────────────┐    │       ┌──────────────┐     │ PostgreSQL │
│  │  Consumer    │────│──────>│ ASC Engine   │────>│            │
│  └─────────────┘    │       └──────┬───────┘     └────────────┘
└─────────────────────┘              │
                        ┌────────────┼────────────┐
                  ┌─ Agents ─────────────────────────────────┐
                  │     │            │            │           │
                  │  ┌──v───┐    ┌──v───┐    ┌──v───┐       │
                  │  │ Echo │    │ Slow │    │Flaky │       │
                  │  └──────┘    └──────┘    └──────┘       │
                  └──────────────────────────────────────────┘
```

## Node Types

Each node is a card with a **colored left border** indicating health:

| Border Color | Meaning |
|-------------|---------|
| Green | Healthy — agent responding, circuit closed |
| Yellow | Degraded — circuit half-open, recovering |
| Red | Unhealthy — circuit open or agent unreachable |
| Gray | Unknown — no data yet |

### Consumer Node
- Request count and last request timestamp

### ASC Engine Node (larger)
- Active task count
- Events per minute
- Server uptime

### Agent Nodes
- **Circuit breaker badge**: `closed` (green), `half-open` (yellow), `open` (red)
- Success rate and average latency

### PostgreSQL Node
- Connection status

### Group Nodes
- Dashed containers that visually group "Consumers" and "Agents"

## Live Indicators

### Connection Status (top-left)
- Green dot + "Live" = WebSocket connected, receiving events
- Red dot + "Disconnected" = WebSocket down, will auto-reconnect (exponential backoff up to 30s)

### Animated Edges
When a task is in-flight, a **glowing particle** travels along the edges:
- **Blue particle** = task in progress
- **Green flash** = task completed successfully
- **Red flash** = task failed

### Event Timeline (bottom-left)
Collapsible panel showing the last 50 WebSocket events, color-coded:
- Blue = `task_created`
- Green = `task_started`, `task_completed`, `circuit_closed`
- Red = `task_failed`, `circuit_opened`, `sla_violation`
- Yellow = `task_timeout`, `circuit_state_change`

### Metrics Panel (right side, toggle with panel icon)
- Backend status and uptime
- WebSocket client count
- Per-agent circuit breaker state with latency sparklines
- Failure counts

## Interactions

- **Pan**: Click and drag on the background
- **Zoom**: Scroll wheel or pinch
- **Drag nodes**: Click and drag any node — positions persist in localStorage
- **MiniMap**: Top-right corner shows the full graph in miniature
- **Controls**: Bottom-right zoom controls

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| All nodes show "unknown" / gray | Backend not running or CORS issue | Start `npm run dev`, check console for errors |
| "Disconnected" indicator won't go green | WebSocket endpoint not registered | Ensure backend was restarted after adding `@fastify/websocket` |
| No particles animate on task submission | Events not broadcasting | Check backend logs for WebSocket client count; verify `emitEvent` changes in repository |
| Agent nodes stay gray despite agents running | Agent IDs don't match between registered agents and canvas config | Canvas expects node IDs matching agent IDs from the `/api/system/status` endpoint |
| Node positions keep resetting | localStorage cleared or private browsing | Positions stored under `asc-canvas-positions` key |

## Related

- [Getting Started](./getting-started.md) — full setup steps
- [API Reference](./api-reference.md) — curl commands to drive the system
- [Architecture](./architecture.md) — what's happening behind the visualization
