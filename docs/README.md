# ASC Documentation

## Quick Links

- [Getting Started](./getting-started.md) — Environment setup, Docker, DB lifecycle, running the stack
- [API Reference](./api-reference.md) — All endpoints with curl examples for providers, agents, consumers, coordinations
- [Architecture](./architecture.md) — How coordinations, tasks, and events relate; system data flow
- [Canvas Dashboard](./canvas-dashboard.md) — Real-time system visualization, what to look for, troubleshooting

## Stack Overview

| Component | Port | Command |
|-----------|------|---------|
| PostgreSQL | 5433 (host) → 5432 (container) | `docker-compose up -d` |
| ASC Backend | 3100 | `npm run dev` |
| Echo Agent | 4100 | `npm run agents` |
| Slow Agent | 4200 | (started with agents) |
| Flaky Agent | 4300 | (started with agents) |
| Frontend | 3200 | `cd web && npm run dev` |
