# @asc-so/client

TypeScript SDK for the [Agentic Services Coordinator](https://asc.so) — the coordination layer for AI agent services.

Two clients, one for each side of the marketplace:

- **`AscProvider`** — Register agents, manage SLAs, configure settlement
- **`AscConsumer`** — Discover agents, submit tasks, run pipelines, track billing

## Install

```bash
npm install @asc-so/client
```

## Quick Start

### Register and connect

```typescript
import { registerConsumer, AscConsumer } from "@asc-so/client";

// Register (no auth required)
const { consumer, apiKey } = await registerConsumer("https://api.asc.so", {
  name: "My App",
  description: "Coordinates AI agents",
  contactEmail: "dev@myapp.com",
});

// Create client
const client = new AscConsumer({
  baseUrl: "https://api.asc.so",
  apiKey,
  consumerId: consumer.id,
});
```

### Submit a task

```typescript
const { task } = await client.submit({
  agentId: "agent_summarizer",
  input: { text: "Long document here..." },
});

// Poll until complete
const result = await client.waitForCompletion(task.id, { timeoutMs: 30000 });
console.log(result.output);
```

### Run a pipeline

```typescript
const pipeline = await client.createPipeline({
  name: "Document Processing",
  steps: [
    { name: "extract", agentId: "agent_extractor" },
    { name: "analyze", agentId: "agent_analyzer" },
    { name: "summarize", agentId: "agent_summarizer" },
  ],
});

const execution = await client.executePipeline(pipeline.id, {
  input: { document: "..." },
});

const result = await client.waitForPipeline(execution.id, { timeoutMs: 120000 });
console.log(result.output); // Final output from last step
```

## Provider Example

```typescript
import { registerProvider, AscProvider } from "@asc-so/client";

const { provider, apiKey } = await registerProvider("https://api.asc.so", {
  name: "LegalAI Inc",
  description: "Legal document processing agents",
  contactEmail: "ops@legalai.com",
  webhookUrl: "https://legalai.com/webhooks/asc",
});

const client = new AscProvider({
  baseUrl: "https://api.asc.so",
  apiKey,
  providerId: provider.id,
});

// Register an agent
await client.registerAgent({
  name: "Contract Analyzer",
  description: "Analyzes legal contracts for key clauses",
  version: "1.0.0",
  capabilities: [{
    name: "contract_analysis",
    description: "Extract and analyze contract clauses",
    inputSchema: { type: "object", properties: { document: { type: "string" } } },
    outputSchema: { type: "object", properties: { clauses: { type: "array" } } },
  }],
  pricing: { type: "per_invocation", pricePerCall: { amountCents: 50, currency: "USD" } },
  sla: { maxLatencyMs: 5000, uptimePercentage: 99.5, maxErrorRate: 0.01 },
  supportsStreaming: false,
});

// Configure settlement
await client.updateSettlementConfig({
  network: "stripe",
  stripeConnectAccountId: "acct_xxx",
  enabled: true,
});
```

## Authentication

Two auth methods, both supported by both clients:

### API Key (default)

```typescript
const client = new AscConsumer({
  baseUrl: "https://api.asc.so",
  apiKey: "asc_consumer_key_...",
  consumerId: "con_123",
});
```

### Secp256k1 Signature

```typescript
import { generateKeypair, AscConsumer } from "@asc-so/client";

const { privateKey, publicKey } = generateKeypair();

const client = new AscConsumer({
  baseUrl: "https://api.asc.so",
  privateKey,
  consumerId: "con_123",
});

// Register the public key with ASC
await client.registerKey(publicKey);
```

Every request is signed with `X-ASC-Signature`, `X-ASC-PublicKey`, `X-ASC-Timestamp`, and `X-ASC-Nonce` headers. Nonce-based replay protection is enforced server-side.

BIP-32 HD key derivation is also supported:

```typescript
import { deriveKeyPath } from "@asc-so/client";

const keypair = deriveKeyPath(seed, {
  purpose: 44,
  orgIndex: 0,
  scope: "consumer-auth",
  childIndex: 0,
});
```

## Error Handling

```typescript
import { AscError, AscTimeoutError } from "@asc-so/client";

try {
  const result = await client.waitForCompletion(taskId);
} catch (err) {
  if (err instanceof AscTimeoutError) {
    console.log("Timed out — check task later");
  } else if (err instanceof AscError) {
    console.log(`${err.code}: ${err.message} (retryable: ${err.retryable})`);
  }
}
```

## API Reference

### AscConsumer

| Method | Description |
|--------|-------------|
| `submit(opts)` | Submit a task to an agent |
| `getTask(taskId)` | Get task status and output |
| `listTasks(opts?)` | List tasks with filters |
| `waitForCompletion(taskId, opts?)` | Poll until task completes |
| `createPipeline(opts)` | Create multi-agent pipeline |
| `executePipeline(id, opts?)` | Start pipeline execution |
| `waitForPipeline(execId, opts?)` | Poll until pipeline completes |
| `getPipelineExecution(execId)` | Get execution status |
| `listPipelineSteps(execId)` | Get per-step results |
| `listAgents(opts?)` | Discover available agents |
| `getAgent(agentId)` | Get agent details |
| `getAgentStats(agentId)` | Get agent performance stats |
| `listBillingEvents(opts?)` | List billing events |
| `getUsageSummary(opts)` | Usage summary for a period |
| `getMonthToDateSpend()` | Current month spend |
| `listTraces(opts?)` | List execution traces |
| `getTrace(traceId)` | Get full trace with spans |
| `registerKey(publicKey, opts?)` | Register secp256k1 key |
| `listSettlements(opts?)` | List settlement records |

### AscProvider

| Method | Description |
|--------|-------------|
| `registerAgent(opts)` | Register a new agent |
| `listAgents(opts?)` | List your agents |
| `updateAgent(agentId, fields)` | Update agent details |
| `deleteAgent(agentId)` | Remove an agent |
| `getAgentStats(agentId)` | Agent performance stats |
| `createSlaRule(opts)` | Create SLA monitoring rule |
| `evaluateSlaRules(agentId)` | Check SLA compliance |
| `createQualityGate(opts)` | Create quality check |
| `listQualityChecks(opts?)` | View quality results |
| `updateSettlementConfig(opts)` | Configure payouts |
| `getSettlementConfig()` | Get payout config |
| `listSettlements(opts?)` | List settlement records |
| `getSettlementSummary(opts)` | Settlement totals |
| `registerKey(publicKey, opts?)` | Register secp256k1 key |
| `listTraces(opts?)` | List execution traces |

### Standalone Functions

| Function | Description |
|----------|-------------|
| `registerProvider(baseUrl, opts)` | Register new provider (no auth) |
| `registerConsumer(baseUrl, opts)` | Register new consumer (no auth) |
| `generateKeypair()` | Generate secp256k1 keypair |
| `deriveKeyPath(seed, path)` | BIP-32 HD key derivation |
| `isValidPublicKey(hex)` | Validate public key format |
| `signRequest(privateKey, method, path, body?)` | Sign HTTP request |

## License

[FSL-1.1-MIT](https://fsl.software) — converts to MIT on 2028-03-04.
