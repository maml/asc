// Factory functions for creating test entities via direct SQL inserts.
// Returns branded IDs so tests can reference them type-safely.

import type pg from "pg";
import type { ProviderId, ConsumerId, AgentId, CoordinationId, TaskId, TraceId } from "../types/brand.js";
import { generateApiKey, hashApiKey } from "../auth/utils.js";

export interface TestProvider {
  id: ProviderId;
  name: string;
  webhookUrl: string;
  apiKeyHash: string;
  apiKey: string;
}

export async function createTestProvider(
  pool: pg.Pool,
  overrides?: Partial<{
    name: string;
    webhookUrl: string;
    status: string;
    contactEmail: string;
  }>
): Promise<TestProvider> {
  const name = overrides?.name ?? `test-provider-${Date.now()}`;
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const { rows } = await pool.query(
    `INSERT INTO providers (name, description, contact_email, webhook_url, api_key_hash, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, webhook_url, api_key_hash`,
    [
      name,
      "Test provider",
      overrides?.contactEmail ?? "test@example.com",
      overrides?.webhookUrl ?? "http://localhost:9999",
      apiKeyHash,
      overrides?.status ?? "active",
      "{}",
    ]
  );
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row["id"] as ProviderId,
    name: row["name"] as string,
    webhookUrl: row["webhook_url"] as string,
    apiKeyHash: row["api_key_hash"] as string,
    apiKey,
  };
}

export interface TestConsumer {
  id: ConsumerId;
  name: string;
  apiKeyHash: string;
  apiKey: string;
}

export async function createTestConsumer(
  pool: pg.Pool,
  overrides?: Partial<{ name: string; status: string }>
): Promise<TestConsumer> {
  const name = overrides?.name ?? `test-consumer-${Date.now()}`;
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const { rows } = await pool.query(
    `INSERT INTO consumers (name, description, contact_email, api_key_hash, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, api_key_hash`,
    [
      name,
      "Test consumer",
      "consumer@example.com",
      apiKeyHash,
      overrides?.status ?? "active",
      "{}",
    ]
  );
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row["id"] as ConsumerId,
    name: row["name"] as string,
    apiKeyHash: row["api_key_hash"] as string,
    apiKey,
  };
}

export interface TestAgent {
  id: AgentId;
  providerId: ProviderId;
  name: string;
}

export async function createTestAgent(
  pool: pg.Pool,
  providerId: ProviderId,
  overrides?: Partial<{
    name: string;
    status: string;
    pricing: Record<string, unknown>;
    capabilities: unknown[];
    sla: Record<string, unknown>;
  }>
): Promise<TestAgent> {
  const name = overrides?.name ?? `test-agent-${Date.now()}`;
  const pricing = overrides?.pricing ?? {
    type: "per_invocation",
    pricePerCall: { amountCents: 50, currency: "USD" },
  };
  const sla = overrides?.sla ?? {
    maxLatencyMs: 5000,
    uptimePercentage: 99.9,
    maxErrorRate: 0.01,
  };
  const capabilities = overrides?.capabilities ?? [
    { name: "echo", description: "Echoes input", inputSchema: {}, outputSchema: {} },
  ];

  const { rows } = await pool.query(
    `INSERT INTO agents (provider_id, name, description, version, status, capabilities, pricing, sla, supports_streaming, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, provider_id, name`,
    [
      providerId,
      name,
      "Test agent",
      "1.0.0",
      overrides?.status ?? "active",
      JSON.stringify(capabilities),
      JSON.stringify(pricing),
      JSON.stringify(sla),
      false,
      "{}",
    ]
  );
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row["id"] as AgentId,
    providerId: row["provider_id"] as ProviderId,
    name: row["name"] as string,
  };
}

// Creates a full entity chain: provider → consumer → agent → coordination → task
export interface TestEntityChain {
  provider: TestProvider;
  consumer: TestConsumer;
  agent: TestAgent;
  coordinationId: CoordinationId;
  taskId: TaskId;
  traceId: TraceId;
}

export async function createFullEntityChain(
  pool: pg.Pool,
  overrides?: Partial<{ agentStatus: string; providerWebhookUrl: string }>
): Promise<TestEntityChain> {
  const provider = await createTestProvider(pool, {
    webhookUrl: overrides?.providerWebhookUrl,
  });
  const consumer = await createTestConsumer(pool);
  const agent = await createTestAgent(pool, provider.id, {
    status: overrides?.agentStatus,
  });

  // Create coordination
  const { rows: coordRows } = await pool.query(
    `INSERT INTO coordinations (consumer_id, agent_id, priority, metadata)
     VALUES ($1, $2, 'normal', '{}')
     RETURNING id, trace_id`,
    [consumer.id, agent.id]
  );
  const coordRow = coordRows[0] as Record<string, unknown>;
  const coordinationId = coordRow["id"] as CoordinationId;
  const traceId = coordRow["trace_id"] as TraceId;

  // Create task
  const { rows: taskRows } = await pool.query(
    `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, max_attempts, timeout_ms, metadata)
     VALUES ($1, $2, $3, $4, 'normal', $5, 3, 30000, '{}')
     RETURNING id`,
    [coordinationId, agent.id, consumer.id, traceId, JSON.stringify({ test: true })]
  );
  const taskId = (taskRows[0] as Record<string, unknown>)["id"] as TaskId;

  return { provider, consumer, agent, coordinationId, taskId, traceId };
}

// Helper to build auth header from an API key
export function authHeader(apiKey: string): { authorization: string } {
  return { authorization: `Bearer ${apiKey}` };
}
