import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { buildApp } from "../app.js";
import { clearAuthCache } from "../auth/hook.js";
import type { FastifyInstance } from "fastify";

// Helpers to create valid request bodies
function providerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme AI",
    description: "NLP provider",
    contactEmail: "ops@acme.dev",
    webhookUrl: "https://acme.dev/webhook",
    ...overrides,
  };
}

function consumerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Widget Corp",
    description: "Consumer of AI services",
    contactEmail: "eng@widget.co",
    ...overrides,
  };
}

function agentBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Summarizer",
    description: "Summarizes documents",
    version: "1.0.0",
    capabilities: ["summarize", "extract"],
    pricing: { model: "per_call", pricePerCall: 100 },
    sla: { maxLatencyMs: 5000, availability: 99.9 },
    supportsStreaming: false,
    ...overrides,
  };
}

// Creates a provider via the API and returns its id + apiKey
async function createProvider(app: FastifyInstance, overrides: Record<string, unknown> = {}): Promise<{ id: string; apiKey: string }> {
  const res = await app.inject({ method: "POST", url: "/api/providers", payload: providerBody(overrides) });
  const { data } = res.json();
  return { id: data.provider.id, apiKey: data.apiKey };
}

// Creates a consumer via the API and returns its id + apiKey
async function createConsumer(app: FastifyInstance, overrides: Record<string, unknown> = {}): Promise<{ id: string; apiKey: string }> {
  const res = await app.inject({ method: "POST", url: "/api/consumers", payload: consumerBody(overrides) });
  const { data } = res.json();
  return { id: data.consumer.id, apiKey: data.apiKey };
}

// Creates a provider + agent and returns both ids + provider's apiKey
async function createAgent(app: FastifyInstance, agentOverrides: Record<string, unknown> = {}): Promise<{ providerId: string; agentId: string; providerApiKey: string }> {
  const { id: providerId, apiKey: providerApiKey } = await createProvider(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/providers/${providerId}/agents`,
    payload: agentBody(agentOverrides),
    headers: { authorization: `Bearer ${providerApiKey}` },
  });
  return { providerId, agentId: res.json().data.agent.id, providerApiKey };
}

describe("Registry API", () => {
  const pool = getTestPool();
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = await buildApp(pool);
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  // --- Providers ---

  it("POST /api/providers returns 201 with provider + apiKey", async () => {
    const res = await app.inject({ method: "POST", url: "/api/providers", payload: providerBody() });

    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.provider).toBeDefined();
    expect(data.provider.id).toBeDefined();
    expect(data.provider.name).toBe("Acme AI");
    expect(data.provider.contactEmail).toBe("ops@acme.dev");
    expect(data.provider.status).toBe("pending_review");
    expect(data.apiKey).toMatch(/^asc_/);
  });

  it("GET /api/providers returns list with pagination", async () => {
    const { apiKey: key1 } = await createProvider(app, { name: "P1" });
    await createProvider(app, { name: "P2" });
    await createProvider(app, { name: "P3" });

    const res = await app.inject({
      method: "GET",
      url: "/api/providers?limit=2",
      headers: { authorization: `Bearer ${key1}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.providers).toHaveLength(2);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.hasMore).toBe(true);
  });

  it("GET /api/providers/:id returns provider", async () => {
    const { id, apiKey } = await createProvider(app);

    const res = await app.inject({
      method: "GET",
      url: `/api/providers/${id}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.id).toBe(id);
    expect(data.name).toBe("Acme AI");
  });

  it("GET /api/providers/:id returns 404 for missing", async () => {
    const { apiKey } = await createProvider(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/providers/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("PATCH /api/providers/:id updates provider", async () => {
    const { id, apiKey } = await createProvider(app);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/providers/${id}`,
      payload: { name: "Updated AI" },
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe("Updated AI");
  });

  it("DELETE /api/providers/:id returns 204", async () => {
    const { id, apiKey } = await createProvider(app);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/providers/${id}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const getRes = await app.inject({
      method: "GET",
      url: `/api/providers/${id}`,
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // --- Consumers ---

  it("POST /api/consumers returns 201 with consumer + apiKey", async () => {
    const res = await app.inject({ method: "POST", url: "/api/consumers", payload: consumerBody() });

    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.consumer).toBeDefined();
    expect(data.consumer.id).toBeDefined();
    expect(data.consumer.name).toBe("Widget Corp");
    expect(data.apiKey).toMatch(/^asc_/);
  });

  it("GET /api/consumers/:id returns 404 for missing", async () => {
    const { apiKey } = await createConsumer(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/consumers/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  // --- Agents ---

  it("POST /api/providers/:providerId/agents returns 201 with agent", async () => {
    const { id: providerId, apiKey } = await createProvider(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/providers/${providerId}/agents`,
      payload: agentBody(),
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.agent).toBeDefined();
    expect(data.agent.id).toBeDefined();
    expect(data.agent.name).toBe("Summarizer");
    expect(data.agent.providerId).toBe(providerId);
    expect(data.agent.capabilities).toEqual(["summarize", "extract"]);
  });

  it("GET /api/agents returns agent list", async () => {
    const { providerApiKey } = await createAgent(app, { name: "Agent A" });
    await createAgent(app, { name: "Agent B" });

    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: `Bearer ${providerApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.agents).toHaveLength(2);
    expect(data.pagination).toBeDefined();
  });

  it("GET /api/agents/:id returns agent", async () => {
    const { agentId, providerApiKey } = await createAgent(app);

    const res = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}`,
      headers: { authorization: `Bearer ${providerApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.id).toBe(agentId);
    expect(data.name).toBe("Summarizer");
  });

  it("GET /api/agents/:id returns 404 for missing", async () => {
    const { providerApiKey } = await createAgent(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/agents/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${providerApiKey}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("PATCH /api/agents/:id updates agent status", async () => {
    const { agentId, providerApiKey } = await createAgent(app);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/agents/${agentId}`,
      payload: { status: "active" },
      headers: { authorization: `Bearer ${providerApiKey}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("active");
  });

  it("DELETE /api/agents/:id returns 204", async () => {
    const { agentId, providerApiKey } = await createAgent(app);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/agents/${agentId}`,
      headers: { authorization: `Bearer ${providerApiKey}` },
    });

    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const getRes = await app.inject({
      method: "GET",
      url: `/api/agents/${agentId}`,
      headers: { authorization: `Bearer ${providerApiKey}` },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
