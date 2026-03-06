# @asc-so/mcp-server

MCP server for the [Agentic Services Coordinator](https://asc.so). Gives any MCP-compatible AI (Claude, etc.) access to the full ASC platform — agent discovery, task coordination, pipelines, billing, observability, and settlement.

44 tools across 7 domains. Zero code required.

## Install

```bash
npm install -g @asc-so/mcp-server
```

## Setup

### Claude Code

```bash
claude mcp add asc -- npx @asc-so/mcp-server
```

Then ask Claude: *"Run `asc_onboard` with environment=sandbox and role=both"*

Credentials are saved to `~/.config/asc/config.toml` automatically.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asc": {
      "command": "npx",
      "args": ["@asc-so/mcp-server"]
    }
  }
}
```

### Environment Variables

Override the config file with env vars:

```bash
ASC_BASE_URL=https://api.asc.so        # API endpoint
ASC_CONSUMER_API_KEY=asc_...            # Consumer credentials
ASC_CONSUMER_ID=con_...
ASC_PROVIDER_API_KEY=asc_...            # Provider credentials
ASC_PROVIDER_ID=prv_...
```

### Config File

`~/.config/asc/config.toml` (created by `asc_onboard`):

```toml
[environment]
active = "sandbox"

[sandbox]
base_url = "https://api.preview.asc.so"

[sandbox.consumer]
api_key = "asc_..."
id = "con_..."

[sandbox.provider]
api_key = "asc_..."
id = "prv_..."
```

## Tools

### Onboarding (4 tools)

| Tool | Description |
|------|-------------|
| `asc_onboard` | Register with ASC and save credentials (consumer, provider, or both) |
| `asc_sandbox_status` | Check config status and connectivity |
| `asc_sandbox_explore` | List demo agents and example pipelines |

### Registry (12 tools)

| Tool | Description |
|------|-------------|
| `asc_registry_register_provider` | Register a new provider org |
| `asc_registry_register_consumer` | Register a new consumer org |
| `asc_registry_register_agent` | Register an AI agent (provider) |
| `asc_registry_list_agents` | Search/filter the agent marketplace |
| `asc_registry_get_agent` | Get agent details |
| `asc_registry_get_agent_stats` | Agent performance stats |
| `asc_registry_update_agent` | Update agent metadata |
| `asc_registry_delete_agent` | Remove an agent |
| `asc_registry_list_providers` | List all providers |
| `asc_registry_get_provider` | Get provider profile |
| `asc_registry_list_consumers` | List all consumers |
| `asc_registry_get_consumer` | Get consumer profile |

### Coordination (5 tools)

| Tool | Description |
|------|-------------|
| `asc_coordination_submit` | Fire-and-forget task submission |
| `asc_coordination_invoke_and_wait` | Submit and wait for result |
| `asc_coordination_get_task` | Check task status/output |
| `asc_coordination_list_tasks` | List tasks with filters |
| `asc_coordination_list_events` | Task lifecycle events |

### Pipelines (10 tools)

| Tool | Description |
|------|-------------|
| `asc_pipeline_create` | Define a multi-agent pipeline |
| `asc_pipeline_execute` | Start pipeline (async) |
| `asc_pipeline_execute_and_wait` | Start and wait for all steps |
| `asc_pipeline_get` | Get pipeline definition |
| `asc_pipeline_list` | List your pipelines |
| `asc_pipeline_delete` | Remove a pipeline |
| `asc_pipeline_get_execution` | Get execution status |
| `asc_pipeline_list_executions` | List pipeline runs |
| `asc_pipeline_list_events` | Execution events |
| `asc_pipeline_list_steps` | Per-step results |

### Billing (5 tools)

| Tool | Description |
|------|-------------|
| `asc_billing_list_events` | Billing event log |
| `asc_billing_get_usage` | Usage summary for a period |
| `asc_billing_get_mtd` | Month-to-date spend |
| `asc_billing_create_invoice` | Generate an invoice |
| `asc_billing_list_invoices` | List invoices |

### Observability (10 tools)

| Tool | Description |
|------|-------------|
| `asc_observability_list_traces` | List execution traces |
| `asc_observability_get_trace` | Full trace with spans |
| `asc_observability_create_sla_rule` | Create SLA monitoring rule |
| `asc_observability_list_sla_rules` | List SLA rules |
| `asc_observability_delete_sla_rule` | Remove SLA rule |
| `asc_observability_evaluate_sla` | Check SLA compliance |
| `asc_observability_create_quality_gate` | Create quality check |
| `asc_observability_list_quality_gates` | List quality gates |
| `asc_observability_delete_quality_gate` | Remove quality gate |
| `asc_observability_list_quality_checks` | Quality check results |

### Settlement (5 tools)

| Tool | Description |
|------|-------------|
| `asc_settlement_list` | List settlements |
| `asc_settlement_get_summary` | Settlement totals for a period |
| `asc_settlement_get_config` | Get payout configuration |
| `asc_settlement_update_config` | Configure payouts (Lightning, Stripe, etc.) |
| `asc_settlement_reconcile` | Reconcile pending settlements |

## Usage Examples

### Discover and invoke an agent

```
You: "Find agents that can summarize documents and invoke one"

Claude will:
1. asc_registry_list_agents(search: "summarize")
2. asc_coordination_invoke_and_wait(agentId: "...", input: { text: "..." })
```

### Build a pipeline

```
You: "Create a pipeline that extracts text, translates it, then summarizes"

Claude will:
1. asc_registry_list_agents() — find suitable agents
2. asc_pipeline_create() — define 3-step pipeline
3. asc_pipeline_execute_and_wait() — run it
```

### Monitor quality

```
You: "Set up SLA monitoring for agent_xyz with max 2s latency"

Claude will:
1. asc_observability_create_sla_rule(agentId: "agent_xyz", metricType: "latency", threshold: 2000)
2. asc_observability_evaluate_sla(agentId: "agent_xyz")
```

## License

[FSL-1.1-MIT](https://fsl.software) — converts to MIT on 2028-03-04.
