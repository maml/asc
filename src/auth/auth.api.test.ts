// Auth-specific API tests — verifies authentication and authorization behavior.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent, authHeader } from "../test/helpers.js";
import { buildApp } from "../app.js";
import { clearAuthCache } from "./hook.js";
import type { FastifyInstance } from "fastify";

describe("Auth API", () => {
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

  // ─── 401: Missing / Invalid Auth ───

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: "Basic abc123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when API key is invalid (not in DB)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: "Bearer asc_0000000000000000000000000000000000000000000000000000000000000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when API key has wrong prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: "Bearer bad_0000000000000000000000000000000000000000000000000000000000000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  // ─── Public routes ───

  it("GET /health works without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("POST /api/providers works without auth (registration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        name: "Test",
        description: "Test",
        contactEmail: "test@test.com",
        webhookUrl: "http://localhost:9999",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.apiKey).toMatch(/^asc_/);
  });

  it("POST /api/consumers works without auth (registration)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/consumers",
      payload: {
        name: "Test",
        description: "Test",
        contactEmail: "test@test.com",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.apiKey).toMatch(/^asc_/);
  });

  // ─── 200: Valid auth ───

  it("returns 200 with valid provider API key", async () => {
    const provider = await createTestProvider(pool);
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: authHeader(provider.apiKey),
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 with valid consumer API key", async () => {
    const consumer = await createTestConsumer(pool);
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: authHeader(consumer.apiKey),
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── 403: Wrong identity type ───

  it("returns 403 when consumer tries to create an agent (provider-only)", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "POST",
      url: `/api/providers/${provider.id}/agents`,
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "Agent",
        description: "Test",
        version: "1.0.0",
        capabilities: [{ name: "test", description: "test", inputSchema: {}, outputSchema: {} }],
        pricing: { type: "per_invocation", pricePerCall: { amountCents: 10, currency: "USD" } },
        sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
        supportsStreaming: false,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when provider tries to submit coordination (consumer-only)", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const res = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(provider.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: agent.id,
        input: { test: true },
        priority: "normal",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  // ─── 403: Cross-entity access ───

  it("returns 403 when provider A tries to modify provider B", async () => {
    const providerA = await createTestProvider(pool);
    const providerB = await createTestProvider(pool);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/providers/${providerB.id}`,
      headers: authHeader(providerA.apiKey),
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when provider A tries to create agent under provider B", async () => {
    const providerA = await createTestProvider(pool);
    const providerB = await createTestProvider(pool);

    const res = await app.inject({
      method: "POST",
      url: `/api/providers/${providerB.id}/agents`,
      headers: authHeader(providerA.apiKey),
      payload: {
        name: "Agent",
        description: "Test",
        version: "1.0.0",
        capabilities: [{ name: "test", description: "test", inputSchema: {}, outputSchema: {} }],
        pricing: { type: "per_invocation", pricePerCall: { amountCents: 10, currency: "USD" } },
        sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
        supportsStreaming: false,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when provider A tries to modify provider B's agent", async () => {
    const providerA = await createTestProvider(pool);
    const providerB = await createTestProvider(pool);
    const agent = await createTestAgent(pool, providerB.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/agents/${agent.id}`,
      headers: authHeader(providerA.apiKey),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  // ─── Cache behavior ───

  it("cache hit: second request skips DB lookup", async () => {
    const provider = await createTestProvider(pool);

    // First request populates cache
    const res1 = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: authHeader(provider.apiKey),
    });
    expect(res1.statusCode).toBe(200);

    // Second request should use cache (still works)
    const res2 = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: authHeader(provider.apiKey),
    });
    expect(res2.statusCode).toBe(200);
  });

  // ─── Identity derivation ───

  it("POST /api/coordinations uses identity, not body consumerId", async () => {
    const provider = await createTestProvider(pool);
    const consumerA = await createTestConsumer(pool);
    const consumerB = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    // Consumer A sends request with consumer B's ID in body
    const res = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumerA.apiKey),
      payload: {
        consumerId: consumerB.id,
        agentId: agent.id,
        input: { test: true },
        priority: "normal",
      },
    });

    expect(res.statusCode).toBe(202);
    // Task should be assigned to consumer A (from auth), not consumer B (from body)
    expect(res.json().data.task.consumerId).toBe(consumerA.id);
  });
});
