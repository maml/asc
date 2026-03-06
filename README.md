# ASC — Agentic Services Coordinator

The coordination layer for AI agent services. Register agents, route work, enforce SLAs, settle payments.

**[asc.so](https://asc.so)** | **[API: api.asc.so](https://api.asc.so/health)**

## What is ASC?

ASC is infrastructure for the agent services economy. Providers register AI agents with capabilities and pricing. Consumers discover agents and coordinate work through a unified API. ASC handles the hard parts: routing, retries, circuit breaking, quality gates, tracing, billing, and settlement.

Think Stripe for agent services — but instead of payment processing, it's work coordination.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`@asc-so/client`](packages/client/) | [![npm](https://img.shields.io/npm/v/@asc-so/client)](https://npmjs.com/package/@asc-so/client) | TypeScript SDK — `AscProvider` and `AscConsumer` clients |
| [`@asc-so/mcp-server`](packages/mcp-server/) | [![npm](https://img.shields.io/npm/v/@asc-so/mcp-server)](https://npmjs.com/package/@asc-so/mcp-server) | MCP server — 44 tools for Claude and other MCP clients |

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  Consumers   │     │  Providers   │
│  (buy work)  │     │ (sell agents)│
└──────┬───────┘     └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────────────────────────┐
│            ASC Platform           │
│                                   │
│  Registry ─── Coordination ────── Pipeline     │
│     │            │                  │          │
│  Auth ──── Observability ──── Billing          │
│     │            │                  │          │
│  Crypto ─── Settlement ──── Realtime (WS)      │
└──────────────────────────────────┘
       │
       ▼
   PostgreSQL
```

**Core modules:**

- **Registry** — Providers, consumers, agents CRUD with marketplace discovery
- **Coordination** — Task routing with retries, circuit breaker, timeout management
- **Pipeline** — Declarative multi-agent chaining (step 1 output → step 2 input)
- **Billing** — Per-invocation/token/second/monthly pricing, usage tracking, invoicing
- **Observability** — Distributed tracing, SLA rules, quality gates
- **Settlement** — Multi-network payouts (Lightning via Phoenixd, Stripe Connect, noop for dev)
- **Auth** — Dual auth: API keys (`Bearer asc_...`) or secp256k1 signatures
- **Crypto** — secp256k1 keypairs, BIP-32 HD derivation, nonce-based replay protection
- **Realtime** — WebSocket event broadcasting

## Quick Start

### Use the MCP server (no code)

```bash
# Add to Claude Code
claude mcp add asc -- npx @asc-so/mcp-server

# Then ask Claude:
# "Run asc_onboard with environment=sandbox and role=both"
# "Show me available agents"
# "Submit a task to agent_echo with input { text: 'hello' }"
```

### Use the SDK

```bash
npm install @asc-so/client
```

```typescript
import { registerConsumer, AscConsumer } from "@asc-so/client";

const { consumer, apiKey } = await registerConsumer("https://api.asc.so", {
  name: "My App",
  description: "Coordinates AI agents",
  contactEmail: "dev@myapp.com",
});

const client = new AscConsumer({ baseUrl: "https://api.asc.so", apiKey, consumerId: consumer.id });

const { task } = await client.submit({ agentId: "agent_echo", input: { text: "hello" } });
const result = await client.waitForCompletion(task.id);
console.log(result.output);
```

## Run Locally

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (port 5433, database `asc`, user `asc`)

### Setup

```bash
git clone https://github.com/maml/asc.git
cd asc
npm install
cp .env.example .env         # Edit DB credentials if needed
npm run dev                   # Starts on http://localhost:3100
```

Migrations run automatically on startup.

### Run tests

```bash
npm test                      # All backend tests
npm run test:unit             # Unit tests only
npm run test:repo             # Repository tests (needs Postgres)
npm run test:api              # API integration tests
npm run test:client           # SDK unit tests
npm run test:mcp              # MCP server tests
```

### Run the demo

```bash
npm run dev                   # Start ASC backend
npm run agents                # Start simulated agents (echo, slow, flaky)
npm run demo:docs             # Run the 4-agent document processing pipeline
```

## Self-Host with Docker

```bash
docker compose up
```

Starts PostgreSQL, the ASC backend, and the dashboard. Backend available at `http://localhost:3100`.

See `docker-compose.yml` for full configuration.

## Deploy

ASC is designed for managed deployment:

- **Backend** — [Render](https://render.com) (see `render.yaml`)
- **Database** — [Neon](https://neon.tech) (serverless Postgres)
- **Frontend** — [Vercel](https://vercel.com) (Next.js dashboard at `web/`)

Set `DATABASE_URL` and optional settlement keys (`PHOENIXD_PASSWORD`, `STRIPE_SECRET_KEY`) as environment variables.

## API Endpoints

| Group | Endpoints | Description |
|-------|-----------|-------------|
| Registry | `POST/GET/PATCH/DELETE /api/providers`, `/api/consumers`, `/api/agents` | Marketplace CRUD |
| Coordination | `POST /api/coordinations`, `GET /api/tasks/:id` | Task submission and tracking |
| Pipeline | `POST /api/pipelines`, `POST /api/pipelines/:id/execute` | Multi-agent workflows |
| Billing | `GET /api/billing-events`, `/api/billing/usage`, `/api/billing/mtd` | Usage and invoicing |
| Observability | `GET /api/traces`, `POST /api/sla-rules`, `POST /api/quality-gates` | Monitoring |
| Settlement | `PUT /api/providers/:id/settlement-config`, `GET /api/settlements` | Payouts |
| Crypto | `POST/GET/DELETE /api/keys` | Key management |
| Realtime | `WS /ws/events` | Live event stream |
| Health | `GET /health`, `GET /api/system/status` | Service health |

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend with hot reload |
| `npm start` | Start compiled backend |
| `npm test` | Run all backend tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:repo` | Repository tests |
| `npm run test:api` | API integration tests |
| `npm run test:client` | SDK unit tests |
| `npm run test:mcp` | MCP server tests |
| `npm run build:client` | Build SDK |
| `npm run build:mcp` | Build MCP server |
| `npm run agents` | Start simulated agents |
| `npm run demo:docs` | Run document processing demo |
| `npm run seed:sandbox` | Seed sandbox with demo data |

## License

[FSL-1.1-MIT](LICENSE.md) — Functional Source License. You can use, modify, and self-host ASC freely. The only restriction: you can't offer ASC as a competing hosted service. Converts to MIT on 2028-03-04.
