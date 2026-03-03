import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent, createFullEntityChain, authHeader } from "../test/helpers.js";
import { clearAuthCache } from "../auth/hook.js";
import { buildApp, type AppContext } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { CoordinationService } from "./service.js";

describe("Coordination API routes", () => {
  const pool = getTestPool();
  let app: FastifyInstance;
  let coordService: CoordinationService;

  beforeAll(async () => {
    const ctx = await buildApp(pool);
    app = ctx.app;
    coordService = ctx.coordService;
  });

  afterAll(async () => {
    await coordService.drain();
    await app.close();
  });

  afterEach(async () => {
    // Let fire-and-forget executions settle before truncating
    await coordService.drain();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  // 1. POST /api/coordinations returns 202 with coordinationId and task
  it("POST /api/coordinations returns 202 with coordinationId and task", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "active" });

    const res = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumer.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: agent.id,
        input: { message: "hello" },
        priority: "normal",
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.coordinationId).toBeDefined();
    expect(body.data.task).toBeDefined();
    expect(body.data.task.agentId).toBe(agent.id);
    expect(body.data.task.consumerId).toBe(consumer.id);
    expect(body.data.task.status).toBe("pending");
    expect(body.data.task.input).toEqual({ message: "hello" });
  });

  // 2. POST /api/coordinations returns 400 for nonexistent agent
  it("POST /api/coordinations returns 400 for nonexistent agent", async () => {
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumer.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: "00000000-0000-0000-0000-000000000000",
        input: { message: "hello" },
        priority: "normal",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("AGENT_NOT_FOUND");
  });

  // 3. POST /api/coordinations returns 400 for inactive agent
  it("POST /api/coordinations returns 400 for inactive (draft) agent", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id, { status: "draft" });

    const res = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumer.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: agent.id,
        input: { message: "hello" },
        priority: "normal",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("AGENT_INACTIVE");
  });

  // 4. GET /api/tasks/:id returns task
  it("GET /api/tasks/:id returns the task", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id);

    // Create a task via the coordination endpoint
    const createRes = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumer.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: agent.id,
        input: { foo: "bar" },
        priority: "high",
      },
    });
    const taskId = createRes.json().data.task.id;

    const res = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`,
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(taskId);
    expect(body.data.priority).toBe("high");
    expect(body.data.input).toEqual({ foo: "bar" });
  });

  // 5. GET /api/tasks/:id returns 404 for missing task
  it("GET /api/tasks/:id returns 404 for nonexistent task", async () => {
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "GET",
      url: "/api/tasks/00000000-0000-0000-0000-000000000000",
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // 6. GET /api/tasks returns tasks filtered by status
  it("GET /api/tasks filters by status", async () => {
    // Insert tasks directly to avoid fire-and-forget executeTask changing status
    const { coordinationId, traceId, agent, consumer } =
      await createFullEntityChain(pool);

    // The chain already created one pending task. Create a second with completed status.
    await pool.query(
      `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, status, max_attempts, timeout_ms, metadata)
       VALUES ($1, $2, $3, $4, 'normal', '{}', 'completed', 3, 30000, '{}')`,
      [coordinationId, agent.id, consumer.id, traceId]
    );

    // Filter for pending — should only get the one from the chain
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks?status=pending",
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tasks.length).toBe(1);
    expect(body.data.tasks[0].status).toBe("pending");
    expect(body.data.pagination).toBeDefined();
  });

  // 7. GET /api/coordinations/:id/events returns events
  it("GET /api/coordinations/:id/events returns events", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/coordinations",
      headers: authHeader(consumer.apiKey),
      payload: {
        consumerId: consumer.id,
        agentId: agent.id,
        input: { test: true },
        priority: "normal",
      },
    });
    const coordinationId = createRes.json().data.coordinationId;

    const res = await app.inject({
      method: "GET",
      url: `/api/coordinations/${coordinationId}/events`,
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.events).toBeInstanceOf(Array);
    // At minimum, a task_created event should exist
    expect(body.data.events.length).toBeGreaterThanOrEqual(1);
    const createdEvent = body.data.events.find(
      (e: { payload: { type: string } }) => e.payload.type === "task_created"
    );
    expect(createdEvent).toBeDefined();
    expect(body.data.pagination).toBeDefined();
  });
});
