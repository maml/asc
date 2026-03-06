// E2E smoke tests — full happy path through the coordination engine.
// These tests start a real mock provider HTTP server and exercise
// the entire pipeline: register → activate → coordinate → verify.

import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { getTestPool, truncateAll } from "./setup.js";
import { buildApp, type AppContext } from "../app.js";
import { clearAuthCache } from "../auth/hook.js";
import type { FastifyInstance } from "fastify";

// --- Mock provider server ---

function createMockProvider(opts: {
  port: number;
  handler: (body: Record<string, unknown>) => { status: string; output?: unknown; error?: string; durationMs: number };
}): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "POST" && req.url === "/invoke") {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => {
          const body = JSON.parse(data) as Record<string, unknown>;
          const result = opts.handler(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ taskId: body["taskId"], ...result }));
        });
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(opts.port, () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// --- Poll helper ---

async function pollTaskStatus(
  app: FastifyInstance,
  taskId: string,
  targetStatuses: string[],
  headers?: Record<string, string>,
  maxMs = 10_000,
  intervalMs = 200
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await app.inject({ method: "GET", url: `/api/tasks/${taskId}`, headers });
    const task = res.json().data as Record<string, unknown>;
    if (targetStatuses.includes(task["status"] as string)) return task;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Task ${taskId} did not reach ${targetStatuses.join("/")} within ${maxMs}ms`);
}

// --- Tests ---

describe("E2E Smoke Tests", () => {
  const pool = getTestPool();
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    ctx = await buildApp(pool);
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  it("happy path: register → activate → coordinate → verify output + trace + billing", async () => {
    const PROVIDER_PORT = 19100;
    const mockServer = await createMockProvider({
      port: PROVIDER_PORT,
      handler: (body) => ({
        status: "success",
        output: { echo: body["input"], processed: true },
        durationMs: 50,
      }),
    });

    try {
      // 1. Register provider (public route — no auth needed)
      const provRes = await app.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "E2E Provider",
          description: "Smoke test",
          contactEmail: "e2e@test.com",
          webhookUrl: `http://localhost:${PROVIDER_PORT}`,
        },
      });
      expect(provRes.statusCode).toBe(201);
      const providerId = provRes.json().data.provider.id;
      const providerApiKey = provRes.json().data.apiKey as string;
      const providerAuth = { authorization: `Bearer ${providerApiKey}` };

      // 2. Activate provider (requires provider auth)
      await app.inject({
        method: "PATCH",
        url: `/api/providers/${providerId}`,
        headers: providerAuth,
        payload: { status: "active" },
      });

      // 3. Register consumer (public route — no auth needed)
      const consRes = await app.inject({
        method: "POST",
        url: "/api/consumers",
        payload: {
          name: "E2E Consumer",
          description: "Smoke test",
          contactEmail: "consumer@test.com",
        },
      });
      const consumerId = consRes.json().data.consumer.id;
      const consumerApiKey = consRes.json().data.apiKey as string;
      const consumerAuth = { authorization: `Bearer ${consumerApiKey}` };

      // 4. Register + activate agent (requires provider auth)
      const agentRes = await app.inject({
        method: "POST",
        url: `/api/providers/${providerId}/agents`,
        headers: providerAuth,
        payload: {
          name: "E2E Echo Agent",
          description: "Echoes input",
          version: "1.0.0",
          capabilities: [{ name: "echo", description: "Echo", inputSchema: {}, outputSchema: {} }],
          pricing: { type: "per_invocation", pricePerCall: { amountCents: 25, currency: "USD" } },
          sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
          supportsStreaming: false,
        },
      });
      const agentId = agentRes.json().data.agent.id;
      await app.inject({
        method: "PATCH",
        url: `/api/agents/${agentId}`,
        headers: providerAuth,
        payload: { status: "active" },
      });

      // 5. Submit coordination (requires consumer auth)
      const coordRes = await app.inject({
        method: "POST",
        url: "/api/coordinations",
        headers: consumerAuth,
        payload: {
          consumerId,
          agentId,
          input: { message: "smoke test" },
          priority: "normal",
        },
      });
      expect(coordRes.statusCode).toBe(202);
      const taskId = coordRes.json().data.task.id;
      const coordinationId = coordRes.json().data.coordinationId;

      // 6. Poll for completion (requires consumer auth)
      const completedTask = await pollTaskStatus(app, taskId, ["completed"], consumerAuth);
      expect(completedTask["output"]).toEqual({ echo: { message: "smoke test" }, processed: true });

      // Let fire-and-forget billing/trace writes settle
      await ctx.coordService.drain();

      // 7. Verify trace exists (requires consumer auth)
      const tracesRes = await app.inject({ method: "GET", url: "/api/traces", headers: consumerAuth });
      const traces = tracesRes.json().data.traces;
      expect(traces.length).toBeGreaterThanOrEqual(1);

      // 8. Verify billing event (requires consumer auth)
      const billingRes = await app.inject({
        method: "GET",
        url: `/api/billing-events?consumerId=${consumerId}`,
        headers: consumerAuth,
      });
      const events = billingRes.json().data.events;
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].amount.amountCents).toBe(25);

      // 9. Verify coordination events (requires consumer auth)
      const eventsRes = await app.inject({
        method: "GET",
        url: `/api/coordinations/${coordinationId}/events`,
        headers: consumerAuth,
      });
      const coordEvents = eventsRes.json().data.events;
      const eventTypes = coordEvents.map((e: { payload: { type: string } }) => e.payload.type);
      expect(eventTypes).toContain("task_created");
      expect(eventTypes).toContain("task_completed");
    } finally {
      await closeServer(mockServer);
    }
  }, 30_000);

  it("retry on failure: mock fails twice then succeeds", async () => {
    const PROVIDER_PORT = 19101;
    let callCount = 0;

    const mockServer = await createMockProvider({
      port: PROVIDER_PORT,
      handler: () => {
        callCount++;
        if (callCount <= 2) {
          return { status: "error", error: "Simulated failure", durationMs: 10 };
        }
        return { status: "success", output: { attempt: callCount }, durationMs: 10 };
      },
    });

    try {
      // Register full entity chain via API
      const provRes = await app.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Retry Provider",
          description: "Test",
          contactEmail: "retry@test.com",
          webhookUrl: `http://localhost:${PROVIDER_PORT}`,
        },
      });
      const providerId = provRes.json().data.provider.id;
      const providerApiKey = provRes.json().data.apiKey as string;
      const providerAuth = { authorization: `Bearer ${providerApiKey}` };

      await app.inject({ method: "PATCH", url: `/api/providers/${providerId}`, headers: providerAuth, payload: { status: "active" } });

      const consRes = await app.inject({
        method: "POST",
        url: "/api/consumers",
        payload: { name: "Retry Consumer", description: "Test", contactEmail: "c@test.com" },
      });
      const consumerId = consRes.json().data.consumer.id;
      const consumerApiKey = consRes.json().data.apiKey as string;
      const consumerAuth = { authorization: `Bearer ${consumerApiKey}` };

      const agentRes = await app.inject({
        method: "POST",
        url: `/api/providers/${providerId}/agents`,
        headers: providerAuth,
        payload: {
          name: "Retry Agent",
          description: "Fails then succeeds",
          version: "1.0.0",
          capabilities: [{ name: "retry", description: "Retry", inputSchema: {}, outputSchema: {} }],
          pricing: { type: "per_invocation", pricePerCall: { amountCents: 10, currency: "USD" } },
          sla: { maxLatencyMs: 10000, uptimePercentage: 99, maxErrorRate: 0.5 },
          supportsStreaming: false,
        },
      });
      const agentId = agentRes.json().data.agent.id;
      await app.inject({ method: "PATCH", url: `/api/agents/${agentId}`, headers: providerAuth, payload: { status: "active" } });

      // Submit (requires consumer auth)
      const coordRes = await app.inject({
        method: "POST",
        url: "/api/coordinations",
        headers: consumerAuth,
        payload: { consumerId, agentId, input: { test: "retry" }, priority: "normal" },
      });
      const taskId = coordRes.json().data.task.id;
      const coordinationId = coordRes.json().data.coordinationId;

      // Poll for completion (requires consumer auth)
      const task = await pollTaskStatus(app, taskId, ["completed"], consumerAuth);
      expect(task["output"]).toEqual({ attempt: 3 });
      expect(task["attemptCount"]).toBe(3);

      // Verify task_failed events were emitted (requires consumer auth)
      const eventsRes = await app.inject({
        method: "GET",
        url: `/api/coordinations/${coordinationId}/events`,
        headers: consumerAuth,
      });
      const events = eventsRes.json().data.events;
      const failedEvents = events.filter(
        (e: { payload: { type: string } }) => e.payload.type === "task_failed"
      );
      expect(failedEvents.length).toBeGreaterThanOrEqual(2);
    } finally {
      await closeServer(mockServer);
    }
  }, 30_000);

  it("circuit breaker opens after repeated failures", async () => {
    const PROVIDER_PORT = 19102;

    // Provider always fails
    const mockServer = await createMockProvider({
      port: PROVIDER_PORT,
      handler: () => ({
        status: "error",
        error: "Always fails",
        durationMs: 5,
      }),
    });

    try {
      const provRes = await app.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          name: "Breaker Provider",
          description: "Test",
          contactEmail: "breaker@test.com",
          webhookUrl: `http://localhost:${PROVIDER_PORT}`,
        },
      });
      const providerId = provRes.json().data.provider.id;
      const providerApiKey = provRes.json().data.apiKey as string;
      const providerAuth = { authorization: `Bearer ${providerApiKey}` };

      await app.inject({ method: "PATCH", url: `/api/providers/${providerId}`, headers: providerAuth, payload: { status: "active" } });

      const consRes = await app.inject({
        method: "POST",
        url: "/api/consumers",
        payload: { name: "Breaker Consumer", description: "Test", contactEmail: "b@test.com" },
      });
      const consumerId = consRes.json().data.consumer.id;
      const consumerApiKey = consRes.json().data.apiKey as string;
      const consumerAuth = { authorization: `Bearer ${consumerApiKey}` };

      const agentRes = await app.inject({
        method: "POST",
        url: `/api/providers/${providerId}/agents`,
        headers: providerAuth,
        payload: {
          name: "Breaker Agent",
          description: "Always fails",
          version: "1.0.0",
          capabilities: [{ name: "fail", description: "Fail", inputSchema: {}, outputSchema: {} }],
          pricing: { type: "per_invocation", pricePerCall: { amountCents: 5, currency: "USD" } },
          sla: { maxLatencyMs: 10000, uptimePercentage: 99, maxErrorRate: 0.5 },
          supportsStreaming: false,
        },
      });
      const agentId = agentRes.json().data.agent.id;
      await app.inject({ method: "PATCH", url: `/api/agents/${agentId}`, headers: providerAuth, payload: { status: "active" } });

      // Submit multiple coordinations to trigger circuit breaker
      // Default threshold is 5 failures, each task has 3 attempts max
      // So 2 tasks × 3 attempts = 6 failures should open the breaker
      const taskIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/coordinations",
          headers: consumerAuth,
          payload: { consumerId, agentId, input: { i }, priority: "normal" },
        });
        taskIds.push(res.json().data.task.id);
      }

      // Wait for all to fail (requires consumer auth)
      for (const taskId of taskIds) {
        await pollTaskStatus(app, taskId, ["failed"], consumerAuth);
      }

      // Verify circuit breaker is open
      const state = ctx.circuitBreaker.getState(agentId);
      expect(state.state).toBe("open");
    } finally {
      await closeServer(mockServer);
    }
  }, 30_000);
});
