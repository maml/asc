import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent, authHeader } from "../test/helpers.js";
import { buildApp } from "../app.js";
import type { ConsumerId, AgentId, PipelineId, PipelineExecutionId } from "../types/brand.js";

describe("Pipeline E2E", () => {
  const pool = getTestPool();
  let app: FastifyInstance;
  let consumerId: ConsumerId;
  let consumerApiKey: string;
  let agentId1: AgentId;
  let agentId2: AgentId;

  beforeEach(async () => {
    await truncateAll(pool);
    const ctx = await buildApp(pool);
    app = ctx.app;

    const provider = await createTestProvider(pool, { webhookUrl: "http://localhost:9999" });
    const consumer = await createTestConsumer(pool);
    consumerId = consumer.id;
    consumerApiKey = consumer.apiKey;

    const agent1 = await createTestAgent(pool, provider.id, { name: "echo-1" });
    const agent2 = await createTestAgent(pool, provider.id, { name: "echo-2" });
    agentId1 = agent1.id;
    agentId2 = agent2.id;

    // Mock fetch to simulate echo agents — each echoes back input with agent marker
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          status: "success",
          output: { ...body.input, processed: true },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it("executes a 2-step pipeline end-to-end", async () => {
    // 1. Create pipeline
    const createRes = await app.inject({
      method: "POST",
      url: "/api/pipelines",
      headers: authHeader(consumerApiKey),
      payload: {
        name: "echo-chain",
        description: "Two echo agents chained",
        steps: [
          { name: "first-echo", agentId: agentId1 },
          { name: "second-echo", agentId: agentId2 },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const pipeline = JSON.parse(createRes.body).data;
    const pipelineId = pipeline.id as PipelineId;

    // 2. Execute pipeline
    const execRes = await app.inject({
      method: "POST",
      url: `/api/pipelines/${pipelineId}/execute`,
      headers: authHeader(consumerApiKey),
      payload: { input: { text: "hello" } },
    });
    expect(execRes.statusCode).toBe(202);
    const execution = JSON.parse(execRes.body).data;
    const executionId = execution.id as PipelineExecutionId;

    // 3. Poll until completed (max 10s)
    let finalExec;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const res = await app.inject({
        method: "GET",
        url: `/api/pipeline-executions/${executionId}`,
        headers: authHeader(consumerApiKey),
      });
      finalExec = JSON.parse(res.body).data;
      if (finalExec.status === "completed" || finalExec.status === "failed") break;
      await new Promise((r) => setTimeout(r, 300));
    }

    expect(finalExec.status).toBe("completed");
    // Output should have been processed by both echo agents
    expect(finalExec.output).toBeDefined();
    expect(finalExec.output.processed).toBe(true);

    // 4. Verify events were emitted
    const eventsRes = await app.inject({
      method: "GET",
      url: `/api/pipeline-executions/${executionId}/events`,
      headers: authHeader(consumerApiKey),
    });
    const events = JSON.parse(eventsRes.body).data.events;
    const eventTypes = events.map((e: { payload: { type: string } }) => e.payload.type);

    expect(eventTypes).toContain("pipeline_started");
    expect(eventTypes).toContain("pipeline_step_started");
    expect(eventTypes).toContain("pipeline_step_completed");
    expect(eventTypes).toContain("pipeline_completed");
  });
});
