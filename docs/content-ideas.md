# Content Ideas

## Article Spec: "Building a Production Coordination Platform Entirely with Claude Code"

### Angle
ASC was architected and built end-to-end by an LLM (Claude Code). Not a toy app — a full coordination platform with 350+ tests, 21 database tables, crypto identity, settlement layer, SDK, MCP server, and Next.js frontend. The meta angle: a coordination platform built by a coordinated AI.

### Why This Is Unusual
- Most "vibe-coded" projects are simple CRUD apps or landing pages
- Cursor/Copilot-assisted projects are typically 50-70% LLM-generated with heavy human steering
- Devin-style demos tend to be narrow (fix a bug, build a small feature)
- ASC has coherent architecture at scale: branded types, consistent patterns, real test suite, layers that compose properly

### Key Themes
1. **Scale and depth** — not a weekend hack. Multi-service infrastructure with real Postgres, circuit breakers, retries, quality gates
2. **Architectural coherence** — the hard part isn't generating code, it's maintaining consistent design philosophy across a growing codebase
3. **Production-readiness** — 350+ tests, enforced auth, crypto identity, settlement layer
4. **The sub-agent pattern** — how parallel sub-agents enable building at this pace

### Verified Stats (at time of writing)
- 322 backend tests across 31 files
- 69 SDK unit tests across 4 files
- 89 MCP server tests across 8 files
- 21 database tables, 8 migrations
- 44 MCP tools across 6 domains
- secp256k1 crypto identity with BIP-32 HD key derivation
- L2-agnostic settlement (Lightning/Strike + noop)
- Full Next.js frontend with 12 pages, zero mocks

### Target Channels
- Dev blog / personal site
- Hacker News (lead with the technical depth, not the AI angle)
- Twitter/X thread (condensed version)
- Claude Code community / Anthropic case study potential

### Tone Notes
- Engineering-first. Show the code, the architecture, the test output.
- The "built by AI" angle is the hook but not the whole story — the real story is what's possible now
- Don't overplay the meta angle ("coordination platform built by coordinated AI") — mention it, don't lean on it
- Let the skeptics click through to the repo and see for themselves

### Handoff
When ready, hand this spec to the copywriter in the vmp-feb-22-2026 directory. They have the brand voice, positioning angles, and copy framework already established there.
