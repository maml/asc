# CLAUDE.md

## Running

- `npm run dev` — local server (tsx watch, src/server.ts)
- `npm run typecheck` — tsc --noEmit
- `npm test` — vitest run
- `npm run migrate` — DB migrations
- `npm run build` — tsc

MCP server is a separate package: `npm run start:mcp` after `npm run build:mcp`.

## Skills — When to Use What

| Skill | Trigger |
|-------|---------|
| `/lightning-dev` | L402 payment protocol, Lightning settlement, channel management |
| `/nostr-dev` | Nostr identity (secp256k1/BIP-32), if Nostr integration expands |
| `/btc-dev` | Bitcoin cryptographic identity, key derivation, transaction signing |
| `/docker-dev` | Dockerfile, compose, deployment, health checks |
| `/frontend-design` | React Flow dashboard, web UI components |
| `/claude-api` | Anthropic SDK usage if adding AI-powered coordination features |
| VMP skills | Marketing content — all output goes to the graph (see root CLAUDE.md) |

## Graph Integration

All project knowledge, decisions, research, and marketing content lives in SurrealDB. Use `ee-graph` MCP tools for:

- Project status: `ee-graph:get_project` with `asc`
- Finding related docs: `ee-graph:search` with relevant terms
- Storing decisions: `ee-graph:create_node` as `decision` table, edge to `project:asc`
- Marketing output: follows VMP directives in root CLAUDE.md (tag with `asc`)

Never create local markdown files as a knowledge store.
