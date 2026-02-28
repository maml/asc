# API Reference

[Back to index](./README.md)

All endpoints are on **http://localhost:3100**. Examples use `curl` + `jq` for readability.

---

## Health Check

```bash
curl -s http://localhost:3100/health | jq .
```

## System Status (real-time)

Returns backend health, DB status, agent health checks with circuit breaker state, and WebSocket client count.

```bash
curl -s http://localhost:3100/api/system/status | jq .
```

---

## Registry

### Register a Provider

```bash
curl -s -X POST http://localhost:3100/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Provider",
    "description": "Hosts simulated agents",
    "contactEmail": "test@example.com",
    "webhookUrl": "http://localhost:4100"
  }' | jq .
```

Returns: `{ id: "prov_...", apiKey: "...", ... }`

Save the `id` — you'll need it to register agents.

### List Providers

```bash
curl -s "http://localhost:3100/api/providers?limit=10" | jq .
```

### Get Provider by ID

```bash
curl -s http://localhost:3100/api/providers/<PROVIDER_ID> | jq .
```

---

### Register an Agent

Agents belong to a provider. Use the provider ID from above.

```bash
curl -s -X POST http://localhost:3100/api/providers/<PROVIDER_ID>/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Echo Agent",
    "description": "Echoes input back",
    "version": "1.0.0",
    "capabilities": [{
      "name": "echo",
      "description": "Echo input",
      "inputSchema": {"type": "object"},
      "outputSchema": {"type": "object"}
    }],
    "pricing": {"type": "per_invocation", "pricePerCall": 100},
    "sla": {"maxLatencyMs": 5000, "uptimePercentage": 99.9, "maxErrorRate": 0.01},
    "supportsStreaming": false
  }' | jq .
```

Returns: `{ id: "agent_...", ... }`

Save the `id` — you'll need it for coordination requests.

### List Agents

```bash
curl -s "http://localhost:3100/api/agents?limit=10" | jq .
```

---

### Register a Consumer

```bash
curl -s -X POST http://localhost:3100/api/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Consumer",
    "description": "Canvas test client",
    "contactEmail": "consumer@example.com"
  }' | jq .
```

Returns: `{ id: "cons_...", ... }`

Save the `id` — you'll need it for coordination requests.

### List Consumers

```bash
curl -s "http://localhost:3100/api/consumers?limit=10" | jq .
```

---

## Coordination

> See [Architecture](./architecture.md) for how coordinations, tasks, and events relate.

### Submit a Coordination Request

This is the main action — it creates a coordination, a task, and kicks off async execution against the agent.

```bash
curl -s -X POST http://localhost:3100/api/coordinations \
  -H "Content-Type: application/json" \
  -d '{
    "consumerId": "<CONSUMER_ID>",
    "agentId": "<AGENT_ID>",
    "input": {"message": "Hello from canvas test!"},
    "priority": "normal"
  }' | jq .
```

Returns: the created **Task** object (status will be `pending` or `in_progress`).

**Priority levels**: `low`, `normal`, `high`, `critical`

- `critical` gets 5 retry attempts; all others get 3.
- Timeout defaults to the agent's SLA `maxLatencyMs` unless you pass `timeoutMs`.

### Get a Task

```bash
curl -s http://localhost:3100/api/tasks/<TASK_ID> | jq .
```

### List Tasks

```bash
curl -s "http://localhost:3100/api/tasks?limit=10" | jq .

# Filter by status
curl -s "http://localhost:3100/api/tasks?limit=10&status=completed" | jq .

# Filter by agent
curl -s "http://localhost:3100/api/tasks?limit=10&agentId=<AGENT_ID>" | jq .
```

### List Events for a Coordination

```bash
curl -s "http://localhost:3100/api/coordinations/<COORDINATION_ID>/events?limit=20" | jq .
```

---

## Smoke Test Walkthrough

Run these in order after a fresh DB reset. Each step uses IDs from the previous.

```bash
# 1. Register provider
PROVIDER=$(curl -s -X POST http://localhost:3100/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Provider",
    "description": "Hosts simulated agents",
    "contactEmail": "test@example.com",
    "webhookUrl": "http://localhost:4100"
  }')
PROVIDER_ID=$(echo $PROVIDER | jq -r '.id')
echo "Provider: $PROVIDER_ID"

# 2. Register agent under that provider
AGENT=$(curl -s -X POST http://localhost:3100/api/providers/$PROVIDER_ID/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Echo Agent",
    "description": "Echoes input back",
    "version": "1.0.0",
    "capabilities": [{"name": "echo", "description": "Echo input", "inputSchema": {"type": "object"}, "outputSchema": {"type": "object"}}],
    "pricing": {"type": "per_invocation", "pricePerCall": 100},
    "sla": {"maxLatencyMs": 5000, "uptimePercentage": 99.9, "maxErrorRate": 0.01},
    "supportsStreaming": false
  }')
AGENT_ID=$(echo $AGENT | jq -r '.id')
echo "Agent: $AGENT_ID"

# 3. Register consumer
CONSUMER=$(curl -s -X POST http://localhost:3100/api/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Consumer",
    "description": "Canvas test client",
    "contactEmail": "consumer@example.com"
  }')
CONSUMER_ID=$(echo $CONSUMER | jq -r '.id')
echo "Consumer: $CONSUMER_ID"

# 4. Submit a coordination — watch the canvas!
curl -s -X POST http://localhost:3100/api/coordinations \
  -H "Content-Type: application/json" \
  -d "{
    \"consumerId\": \"$CONSUMER_ID\",
    \"agentId\": \"$AGENT_ID\",
    \"input\": {\"message\": \"Hello from canvas test!\"},
    \"priority\": \"normal\"
  }" | jq .
```

---

## Trigger Circuit Breaker

Register the Flaky Agent (same provider, different webhook), then spam it to force the circuit open.

```bash
# Register flaky agent (uses port 4300)
FLAKY=$(curl -s -X POST http://localhost:3100/api/providers/$PROVIDER_ID/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Flaky Agent",
    "description": "Randomly fails for testing",
    "version": "1.0.0",
    "capabilities": [{"name": "flaky", "description": "Flaky echo", "inputSchema": {"type": "object"}, "outputSchema": {"type": "object"}}],
    "pricing": {"type": "per_invocation", "pricePerCall": 50},
    "sla": {"maxLatencyMs": 5000, "uptimePercentage": 95.0, "maxErrorRate": 0.5},
    "supportsStreaming": false
  }')
FLAKY_ID=$(echo $FLAKY | jq -r '.id')
echo "Flaky Agent: $FLAKY_ID"

# Spam 10 requests — some will fail, circuit should open after 5 failures
for i in $(seq 1 10); do
  echo "--- Request $i ---"
  curl -s -X POST http://localhost:3100/api/coordinations \
    -H "Content-Type: application/json" \
    -d "{
      \"consumerId\": \"$CONSUMER_ID\",
      \"agentId\": \"$FLAKY_ID\",
      \"input\": {\"n\": $i},
      \"priority\": \"normal\"
    }" | jq '{id, status}'
  sleep 0.5
done
```

Watch the canvas — the Flaky Agent node's left border should turn red and the circuit badge should flip to "open" once 5 failures accumulate within the 60-second window.

---

## WebSocket (live events)

Connect to the WebSocket to see events in real time:

```bash
# Using websocat (brew install websocat)
websocat ws://localhost:3100/ws/events

# Or using wscat (npm install -g wscat)
wscat -c ws://localhost:3100/ws/events
```

You'll see JSON events like:
```json
{"type":"task_created","payload":{"coordinationId":"...","taskId":"..."},"timestamp":"..."}
{"type":"task_started","payload":{"coordinationId":"...","taskId":"...","attemptNumber":1},"timestamp":"..."}
{"type":"task_completed","payload":{"coordinationId":"...","taskId":"...","output":{...}},"timestamp":"..."}
```

---

## Related

- [Architecture](./architecture.md) — explains the coordination model
- [Getting Started](./getting-started.md) — environment setup
- [Canvas Dashboard](./canvas-dashboard.md) — visual monitoring
