# ASC Business Model

## Revenue Strategy: Managed Hosting (Supabase/GitLab Playbook)

Open-source core, monetize through managed hosting. Self-hosters run it free; most teams pay us to operate it.

## Revenue Streams

### 1. Platform Fee Rake (Built-in)
5% on every agent invocation flowing through the platform. Scales with usage.
- 100 companies doing $1K/month in agent services = $5K MRR in platform fees
- To hit $50K MRR on rake alone = $1M/month in agent services through ASC
- Rake alone is a slow burn early — supplement with subscriptions

### 2. Managed Hosting Subscription (Primary Early Revenue)

| Tier       | Price        | What they get                                    |
|------------|-------------|--------------------------------------------------|
| Free       | $0          | Self-host, you run everything                    |
| Team       | $99-299/mo  | Managed instance, 5 agents, basic SLA            |
| Business   | $499-999/mo | Higher limits, priority support, custom domain   |
| Enterprise | $2-5K+/mo   | Dedicated infra, SSO, audit logs, SLA guarantee  |

### 3. Usage-Based Overage
Base plan includes X invocations, then charge per-1K above that. Captures upside from high-volume customers without scaring away small ones. (Vercel/Supabase model)

### 4. Marketplace Commission (Longer Term)
If ASC becomes the canonical place to discover/consume agent services: listing fees or higher rake on marketplace-sourced invocations vs. bring-your-own-provider.

## Path to $50K MRR

### Phase 1: Founder-Led Sales (Months 1-6)
- Target: 10-15 design partners on paid plans
- Mix: ~10 Team ($299) + ~3 Business ($799) + ~1 Enterprise ($3K)
- Revenue: ~$8-9K MRR
- Pitch: "Stop building coordination plumbing yourself"

### Phase 2: MCP-Driven Organic Growth (Months 4-9)
- MCP server is the growth hack — add to Claude Code, start using it, bring to team, team needs managed instance
- Developer-led bottoms-up adoption (Stripe playbook)
- Target: 30-40 paying teams
- Revenue: ~$15-20K MRR

### Phase 3: Volume + Usage Overage (Months 8-14)
- Early partners scale up, usage-based pricing kicks in
- Enterprise deals close ($3-5K/mo each)
- Platform fee rake starts contributing meaningfully
- Target: 50-80 paying customers, 3-5 enterprise
- Revenue: $40-50K MRR

## What Makes This Plausible

**Working in our favor:**
- Product is real and deep (350+ tests, 23 endpoints — not a landing page)
- MCP server is a genuine distribution channel
- Pain is real, timing is right — everyone hitting the coordination wall
- Self-host builds trust, managed captures revenue

**Hard parts:**
- Agent services economy still early — need enough companies using multi-agent workflows across org boundaries
- Marketplace chicken-and-egg: consumers want agents listed, providers want consumers
- Competing with "just build it ourselves"

**Bottom line:** $50K MRR in 12-14 months is aggressive but not unrealistic. MCP angle is unique — nobody else offers "add 6 lines of JSON and your AI manages your agent coordination infrastructure." If multi-agent workflows go mainstream in 2026, ASC is positioned perfectly. If slower, we're early and it takes longer — more time to hone.
