// API tests for pipeline routes — verifies CRUD and execution authorization behavior.

import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent, authHeader } from "../test/helpers.js";
import { buildApp } from "../app.js";
import { clearAuthCache } from "../auth/hook.js";
import type { FastifyInstance } from "fastify";
import type { PipelineService } from "./service.js";

describe("Pipeline API routes", () => {
  const pool = getTestPool();
  let app: FastifyInstance;
  let pipelineService: PipelineService;

  beforeAll(async () => {
    const ctx = await buildApp(pool);
    app = ctx.app;
    pipelineService = ctx.pipelineService;
  });

  afterAll(async () => {
    await pipelineService.drain();
    await app.close();
  });

  afterEach(async () => {
    // Let fire-and-forget pipeline executions settle before truncating
    await pipelineService.drain();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  // ─── POST /api/pipelines ───

  it("POST /api/pipelines creates pipeline (consumer only)", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent1 = await createTestAgent(pool, provider.id, { status: "active" });
    const agent2 = await createTestAgent(pool, provider.id, { status: "active" });

    const res = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "test",
        description: "desc",
        steps: [
          { name: "s1", agentId: agent1.id },
          { name: "s2", agentId: agent2.id },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe("test");
    expect(body.data.steps).toHaveLength(2);
  });

  it("POST /api/pipelines rejects provider auth", async () => {
    const provider = await createTestProvider(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const res = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(provider.apiKey),
      payload: {
        name: "test",
        steps: [{ name: "s1", agentId: agent.id }],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/pipelines rejects invalid agent", async () => {
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "test",
        steps: [{ name: "s1", agentId: "00000000-0000-0000-0000-000000000000" }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── GET /api/pipelines ───

  it("GET /api/pipelines lists consumer's pipelines", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    // Create a pipeline first
    await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "my-pipeline",
        steps: [{ name: "step1", agentId: agent.id }],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.pipelines).toHaveLength(1);
  });

  // ─── GET /api/pipelines/:id ───

  it("GET /api/pipelines/:id returns pipeline", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "named-pipeline",
        steps: [{ name: "step1", agentId: agent.id }],
      },
    });
    const { data: created } = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "GET",
      url: `/api/pipelines/${created.id}`,
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe(created.id);
  });

  it("GET /api/pipelines/:id returns 404 for missing", async () => {
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "GET",
      url: "/api/pipelines/00000000-0000-0000-0000-000000000000",
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /api/pipelines/:id ───

  it("DELETE /api/pipelines/:id deletes pipeline", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "to-delete",
        steps: [{ name: "step1", agentId: agent.id }],
      },
    });
    const { data: created } = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/pipelines/${created.id}`,
      headers: authHeader(consumer.apiKey),
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/pipelines/${created.id}`,
      headers: authHeader(consumer.apiKey),
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("DELETE /api/pipelines/:id rejects non-owner", async () => {
    const provider = await createTestProvider(pool);
    const consumer1 = await createTestConsumer(pool);
    const consumer2 = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer1.apiKey),
      payload: {
        name: "owner-pipeline",
        steps: [{ name: "step1", agentId: agent.id }],
      },
    });
    const { data: created } = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/pipelines/${created.id}`,
      headers: authHeader(consumer2.apiKey),
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  // ─── POST /api/pipelines/:id/execute ───

  it("POST /api/pipelines/:id/execute starts execution", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent1 = await createTestAgent(pool, provider.id, { status: "active" });
    const agent2 = await createTestAgent(pool, provider.id, { status: "active" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer.apiKey),
      payload: {
        name: "exec-pipeline",
        steps: [
          { name: "step1", agentId: agent1.id },
          { name: "step2", agentId: agent2.id },
        ],
      },
    });
    const { data: created } = JSON.parse(createRes.body);

    const execRes = await app.inject({
      method: "POST",
      url: `/api/pipelines/${created.id}/execute`,
      headers: authHeader(consumer.apiKey),
      payload: { input: { text: "hi" } },
    });

    expect(execRes.statusCode).toBe(202);
    const body = JSON.parse(execRes.body);
    expect(body.data.status).toBe("pending");
    expect(body.data.totalSteps).toBe(2);
  });

  it("POST /api/pipelines/:id/execute rejects non-owner", async () => {
    const provider = await createTestProvider(pool);
    const consumer1 = await createTestConsumer(pool);
    const consumer2 = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumer1.apiKey),
      payload: {
        name: "exec-owner-pipeline",
        steps: [{ name: "step1", agentId: agent.id }],
      },
    });
    const { data: created } = JSON.parse(createRes.body);

    const execRes = await app.inject({
      method: "POST",
      url: `/api/pipelines/${created.id}/execute`,
      headers: authHeader(consumer2.apiKey),
      payload: { input: { text: "hi" } },
    });

    expect(execRes.statusCode).toBe(403);
  });
});
