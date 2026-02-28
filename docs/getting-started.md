# Getting Started

[Back to index](./README.md)

## Prerequisites

- Docker & Docker Compose
- Node.js (with npm)
- The ASC repo cloned locally

## 1. Start PostgreSQL

```bash
docker-compose up -d
```

This starts Postgres 16 on **host port 5433** (mapped to 5432 inside the container).

**Connection details** (from `docker-compose.yml`):
- User: `asc`
- Password: `asc_dev_password`
- Database: `asc`
- Host: `localhost:5433`

## 2. Run Migrations

```bash
npm run migrate
```

Applies all SQL files from `migrations/` in order. Safe to run multiple times — it tracks which migrations have already been applied.

## 3. Start the Backend

```bash
npm run dev
```

Runs on **http://localhost:3100**. Starts the Fastify server with all routes (registry, coordination, observability, billing, realtime WebSocket).

## 4. Start Simulated Agents

```bash
npm run agents
```

Starts three test agents:
- **Echo Agent** (`:4100`) — Echoes input back immediately
- **Slow Agent** (`:4200`) — Adds artificial delay to responses
- **Flaky Agent** (`:4300`) — Randomly fails ~50% of requests (for testing circuit breakers)

## 5. Start the Frontend

```bash
cd web && npm run dev
```

Runs on **http://localhost:3200**. Open the [System Canvas](http://localhost:3200/canvas) to see the live architecture graph.

---

## Database Management

### Nuke and rebuild (full reset)

Drops all tables and recreates from migrations. Use this when you want a completely clean slate:

```bash
docker-compose exec postgres psql -U asc -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run migrate
```

### Connect to the DB directly

```bash
docker-compose exec postgres psql -U asc
```

Useful queries once connected:

```sql
-- See all tables
\dt

-- Count rows in key tables
SELECT 'providers' AS t, count(*) FROM providers
UNION ALL SELECT 'agents', count(*) FROM agents
UNION ALL SELECT 'consumers', count(*) FROM consumers
UNION ALL SELECT 'tasks', count(*) FROM tasks
UNION ALL SELECT 'coordination_events', count(*) FROM coordination_events;

-- Recent tasks
SELECT id, agent_id, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 10;

-- Recent events
SELECT event_type, payload, timestamp FROM coordination_events ORDER BY timestamp DESC LIMIT 20;
```

### Stop Postgres

```bash
docker-compose down        # stops container, keeps data volume
docker-compose down -v     # stops container AND deletes data volume (full nuke)
```

---

## Full Verification Sequence

After a fresh setup, run through this to confirm everything works end-to-end:

1. `docker-compose up -d`
2. `npm run migrate`
3. `npm run dev` (in one terminal)
4. `npm run agents` (in another terminal)
5. `cd web && npm run dev` (in a third terminal)
6. Open http://localhost:3200/canvas
7. Confirm all nodes show "healthy" status
8. Register entities and submit coordinations — see [API Reference](./api-reference.md#smoke-test-walkthrough)
9. Watch the canvas animate as tasks flow through the system
10. Hammer the Flaky Agent to trigger circuit breaker — see [API Reference](./api-reference.md#trigger-circuit-breaker)

---

## Related

- [API Reference](./api-reference.md) — curl commands for steps 8-10
- [Architecture](./architecture.md) — what's happening under the hood
- [Canvas Dashboard](./canvas-dashboard.md) — what to look for in the UI
