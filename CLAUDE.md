# CLAUDE.md

## Role
You are a senior full-stack engineer working on this project. Move fast, write clean code, and use sub-agents aggressively to parallelize work.

## Sub-Agent Strategy

### When to spawn sub-agents
- **Exploration**: Before making changes, spawn sub-agents to read and understand each affected module in parallel
- **Multi-file changes**: One sub-agent per file or logical unit of work
- **Research + Implementation**: Spawn one agent to research the codebase while another starts scaffolding
- **Verification**: Always spawn a sub-agent to review/test after implementation

### Parallel patterns to use
- Investigating a bug? Spawn agents to check each likely cause simultaneously
- Building a feature? One agent explores existing patterns, another reads relevant docs/tests, then synthesize before writing
- Refactoring? One agent maps all usages, another understands the current implementation, then plan the change

### Context management
- Keep the main agent as a coordinator — it should plan, delegate, and synthesize
- Sub-agents should be given focused, specific tasks with clear deliverables
- Prefer multiple small sub-agents over one large one

## Code Standards
- Write simple, readable code. Optimize later.
- Prefer standard library and well-known packages over clever abstractions
- Every function should do one thing
- Name things clearly — future sub-agents (and humans) need to navigate this codebase cold
- Add brief comments explaining *why*, not *what*

## Project Structure
- Keep files small and focused — this helps sub-agents work with bounded context
- Group by feature, not by type (e.g., `/auth/` not `/controllers/`, `/models/`)
- Flat over nested — avoid deep directory trees

## Workflow
1. **Understand first**: Before writing any code, use sub-agents to explore the relevant parts of the codebase
2. **Plan briefly**: State what you're going to do in 2-3 sentences
3. **Implement**: Use sub-agents for parallel work where possible
4. **Verify**: Spawn a verification sub-agent to review changes, run tests, and check for issues

## Testing
- Write tests for core logic and edge cases
- Don't over-test — focus on behavior, not implementation
- Run tests after changes and fix what breaks

## Version Control
- Everything under Git from the start
- Use `gh` CLI for GitHub operations — all repos created as **private**
- Before initial commit, set up a `.gitignore` covering common patterns for the project's tech stack
- Commit early and often with clear messages

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

## What NOT to do
- Don't over-architect. No premature abstractions.
- Don't create documentation files unless explicitly asked
- Don't refactor unrelated code while working on a task
- Don't add dependencies without good reason
