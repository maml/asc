import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain, authHeader } from "../test/helpers.js";
import { clearAuthCache } from "../auth/hook.js";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

describe("Observability API routes", () => {
  const pool = getTestPool();
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = await buildApp(pool);
    app = ctx.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  // ─── Traces ───

  it("GET /api/traces returns empty list initially", async () => {
    const { provider } = await createFullEntityChain(pool);

    const res = await app.inject({
      method: "GET",
      url: "/api/traces",
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.traces).toEqual([]);
    expect(body.data.hasMore).toBe(false);
  });

  it("GET /api/traces/:traceId returns 404 for missing trace", async () => {
    const { provider } = await createFullEntityChain(pool);
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const res = await app.inject({
      method: "GET",
      url: `/api/traces/${fakeId}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ─── SLA Rules ───

  it("POST /api/sla-rules creates rule (201)", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const res = await app.inject({
      method: "POST",
      url: "/api/sla-rules",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        providerId: provider.id,
        metricType: "latency",
        threshold: 500,
        windowMinutes: 30,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.rule.agentId).toBe(agent.id);
    expect(body.data.rule.metricType).toBe("latency");
    expect(Number(body.data.rule.threshold)).toBe(500);
    expect(body.data.rule.windowMinutes).toBe(30);
  });

  it("GET /api/sla-rules returns rules", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    // Create a rule first
    await app.inject({
      method: "POST",
      url: "/api/sla-rules",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        providerId: provider.id,
        metricType: "latency",
        threshold: 500,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/sla-rules?agentId=${agent.id}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.rules).toHaveLength(1);
    expect(body.data.rules[0].agentId).toBe(agent.id);
  });

  it("DELETE /api/sla-rules/:id returns 204", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/sla-rules",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        providerId: provider.id,
        metricType: "error_rate",
        threshold: 0.05,
      },
    });

    const ruleId = createRes.json().data.rule.id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/sla-rules/${ruleId}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const listRes = await app.inject({
      method: "GET",
      url: `/api/sla-rules?agentId=${agent.id}`,
      headers: authHeader(provider.apiKey),
    });
    expect(listRes.json().data.rules).toHaveLength(0);
  });

  it("POST /api/sla-rules/evaluate returns compliance records", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    // Create a rule to evaluate
    await app.inject({
      method: "POST",
      url: "/api/sla-rules",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        providerId: provider.id,
        metricType: "latency",
        threshold: 1000,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/sla-rules/evaluate",
      headers: authHeader(provider.apiKey),
      payload: { agentId: agent.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.records).toHaveLength(1);
    expect(body.data.records[0].status).toBeDefined();
  });

  // ─── Quality Gates ───

  it("POST /api/quality-gates creates gate (201)", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const res = await app.inject({
      method: "POST",
      url: "/api/quality-gates",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        name: "JSON output check",
        description: "Ensures output is valid JSON",
        checkConfig: { type: "json_schema" },
        required: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.gate.agentId).toBe(agent.id);
    expect(body.data.gate.name).toBe("JSON output check");
    expect(body.data.gate.required).toBe(true);
  });

  it("GET /api/quality-gates returns gates", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    await app.inject({
      method: "POST",
      url: "/api/quality-gates",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        name: "Latency check",
        checkConfig: { type: "latency_threshold", maxMs: 2000 },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/quality-gates",
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.gates.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/quality-gates filters by agentId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);

    // Create a gate for each agent
    await app.inject({
      method: "POST",
      url: "/api/quality-gates",
      headers: authHeader(chain1.provider.apiKey),
      payload: {
        agentId: chain1.agent.id,
        name: "Gate A",
        checkConfig: { type: "json_schema" },
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/quality-gates",
      headers: authHeader(chain2.provider.apiKey),
      payload: {
        agentId: chain2.agent.id,
        name: "Gate B",
        checkConfig: { type: "json_schema" },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/quality-gates?agentId=${chain1.agent.id}`,
      headers: authHeader(chain1.provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.gates).toHaveLength(1);
    expect(body.data.gates[0].name).toBe("Gate A");
  });

  it("DELETE /api/quality-gates/:id returns 204", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/quality-gates",
      headers: authHeader(provider.apiKey),
      payload: {
        agentId: agent.id,
        name: "Temporary gate",
        checkConfig: { type: "json_schema" },
      },
    });

    const gateId = createRes.json().data.gate.id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/quality-gates/${gateId}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const listRes = await app.inject({
      method: "GET",
      url: `/api/quality-gates?agentId=${agent.id}`,
      headers: authHeader(provider.apiKey),
    });
    expect(listRes.json().data.gates).toHaveLength(0);
  });

  it("GET /api/quality-checks returns empty when no checks exist", async () => {
    const { provider } = await createFullEntityChain(pool);

    const res = await app.inject({
      method: "GET",
      url: "/api/quality-checks",
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.records).toEqual([]);
  });
});
