import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider } from "../test/helpers.js";
import { PgAgentRepository } from "./pg-agent-repo.js";
import type { AgentId, ProviderId } from "../types/brand.js";
import type { CreateAgentInput } from "./repository.js";

const pool = getTestPool();
const repo = new PgAgentRepository(pool);

function makeInput(providerId: ProviderId, overrides?: Partial<CreateAgentInput>): CreateAgentInput {
  return {
    providerId,
    name: overrides?.name ?? `agent-${Date.now()}`,
    description: "A test agent",
    version: "1.0.0",
    capabilities: overrides?.capabilities ?? [
      { name: "summarize", description: "Summarizes text", inputSchema: { type: "string" }, outputSchema: { type: "string" } },
    ],
    pricing: overrides?.pricing ?? { type: "per_invocation", pricePerCall: { amountCents: 100, currency: "USD" } },
    sla: overrides?.sla ?? { maxLatencyMs: 3000, uptimePercentage: 99.5, maxErrorRate: 0.02 },
    supportsStreaming: overrides?.supportsStreaming ?? false,
    metadata: overrides?.metadata ?? { env: "test" },
  };
}

describe("PgAgentRepository", () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it("create returns agent with UUID id and defaults status to draft", async () => {
    const provider = await createTestProvider(pool);
    const agent = await repo.create(makeInput(provider.id));

    expect(agent.id).toBeDefined();
    // UUID v4 format
    expect(agent.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(agent.status).toBe("draft");
    expect(agent.providerId).toBe(provider.id);
    expect(agent.createdAt).toBeDefined();
    expect(agent.updatedAt).toBeDefined();
  });

  it("findById returns the created agent", async () => {
    const provider = await createTestProvider(pool);
    const created = await repo.create(makeInput(provider.id, { name: "findable-agent" }));

    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("findable-agent");
  });

  it("findById returns null for a missing id", async () => {
    const found = await repo.findById("00000000-0000-0000-0000-000000000000" as AgentId);
    expect(found).toBeNull();
  });

  it("list returns agents with pagination", async () => {
    const provider = await createTestProvider(pool);
    await repo.create(makeInput(provider.id, { name: "agent-a" }));
    await repo.create(makeInput(provider.id, { name: "agent-b" }));

    const result = await repo.list({ limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("list filters by providerId", async () => {
    const provider1 = await createTestProvider(pool, { name: "provider-1" });
    const provider2 = await createTestProvider(pool, { name: "provider-2" });
    await repo.create(makeInput(provider1.id, { name: "agent-p1" }));
    await repo.create(makeInput(provider2.id, { name: "agent-p2" }));

    const result = await repo.list({ limit: 10 }, { providerId: provider1.id });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].providerId).toBe(provider1.id);
    expect(result.items[0].name).toBe("agent-p1");
  });

  it("list filters by capability using JSONB containment", async () => {
    const provider = await createTestProvider(pool);
    await repo.create(makeInput(provider.id, {
      name: "agent-with-translate",
      capabilities: [
        { name: "translate", description: "Translates text", inputSchema: {}, outputSchema: {} },
      ],
    }));
    await repo.create(makeInput(provider.id, {
      name: "agent-with-summarize",
      capabilities: [
        { name: "summarize", description: "Summarizes text", inputSchema: {}, outputSchema: {} },
      ],
    }));

    const result = await repo.list({ limit: 10 }, { capability: "translate" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("agent-with-translate");
  });

  it("JSONB round-trip: capabilities, pricing, and sla survive insert and read", async () => {
    const provider = await createTestProvider(pool);
    const capabilities = [
      { name: "analyze", description: "Analyzes data", inputSchema: { type: "object", properties: { data: { type: "array" } } }, outputSchema: { type: "object" } },
      { name: "report", description: "Generates reports", inputSchema: {}, outputSchema: {} },
    ];
    const pricing = { type: "per_token" as const, inputPricePerToken: { amountCents: 1, currency: "USD" }, outputPricePerToken: { amountCents: 2, currency: "USD" } };
    const sla = { maxLatencyMs: 10000, uptimePercentage: 99.99, maxErrorRate: 0.001 };

    const created = await repo.create(makeInput(provider.id, { capabilities, pricing, sla }));
    const found = await repo.findById(created.id);

    expect(found!.capabilities).toEqual(capabilities);
    expect(found!.pricing).toEqual(pricing);
    expect(found!.sla).toEqual(sla);
  });

  it("update changes partial fields and returns the updated agent", async () => {
    const provider = await createTestProvider(pool);
    const created = await repo.create(makeInput(provider.id, { name: "original-name" }));

    const updated = await repo.update(created.id, {
      name: "updated-name",
      status: "active",
      supportsStreaming: true,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("updated-name");
    expect(updated.status).toBe("active");
    expect(updated.supportsStreaming).toBe(true);
    // Unchanged fields preserved
    expect(updated.description).toBe(created.description);
    expect(updated.version).toBe(created.version);
  });

  it("update throws for a missing agent", async () => {
    const missingId = "00000000-0000-0000-0000-000000000000" as AgentId;

    await expect(repo.update(missingId, { name: "nope" })).rejects.toThrow(
      `Agent ${missingId} not found`
    );
  });

  it("create with invalid providerId throws FK violation", async () => {
    const bogusProviderId = "00000000-0000-0000-0000-000000000000" as ProviderId;

    await expect(repo.create(makeInput(bogusProviderId))).rejects.toThrow();
  });
});
