import { describe, it, expect, beforeEach, vi } from "vitest";
import { AscConsumer, registerConsumer } from "../consumer.js";
import { AscError, AscTimeoutError } from "../errors.js";
import type { ConsumerId } from "../types.js";

const BASE_URL = "http://localhost:3100";
const API_KEY = "asc_test_consumer_key";
const CONSUMER_ID = "cons_123" as ConsumerId;

function mockFetch(
  status: number,
  body: unknown,
  expectedMethod?: string,
  expectedPath?: string,
) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (expectedMethod) expect(init?.method).toBe(expectedMethod);
    if (expectedPath) expect(String(url)).toContain(expectedPath);
    return new Response(
      status === 204 ? null : JSON.stringify(body),
      { status, headers: { "Content-Type": "application/json" } },
    );
  });
}

describe("AscConsumer", () => {
  let consumer: AscConsumer;

  beforeEach(() => {
    consumer = new AscConsumer({ baseUrl: BASE_URL, apiKey: API_KEY, consumerId: CONSUMER_ID });
    vi.restoreAllMocks();
  });

  // --- Auth ---

  it("sends Authorization header on every request", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${API_KEY}`,
      );
      return new Response(JSON.stringify({ data: { id: CONSUMER_ID } }), { status: 200 });
    });
    await consumer.getProfile();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Self management ---

  it("getProfile sends GET /api/consumers/:id", async () => {
    const mockConsumer = { id: CONSUMER_ID, name: "Test" };
    globalThis.fetch = mockFetch(200, { data: mockConsumer }, "GET", `/api/consumers/${CONSUMER_ID}`);
    const result = await consumer.getProfile();
    expect(result).toEqual(mockConsumer);
  });

  it("update sends PATCH /api/consumers/:id", async () => {
    const updated = { id: CONSUMER_ID, name: "Updated" };
    globalThis.fetch = mockFetch(200, { data: updated }, "PATCH", `/api/consumers/${CONSUMER_ID}`);
    const result = await consumer.update({ name: "Updated" } as never);
    expect(result).toEqual(updated);
  });

  it("delete sends DELETE /api/consumers/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", `/api/consumers/${CONSUMER_ID}`);
    await consumer.delete();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Coordination ---

  it("submit sends POST /api/coordinations", async () => {
    const response = { coordinationId: "coord_1", task: { id: "task_1", status: "pending" } };
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.agentId).toBe("agent_1");
      expect(body.input).toEqual({ text: "hello" });
      return new Response(JSON.stringify({ data: response }), { status: 202 });
    });
    const result = await consumer.submit({
      agentId: "agent_1",
      input: { text: "hello" },
      priority: "normal",
    });
    expect(result.coordinationId).toBe("coord_1");
    expect(result.task.id).toBe("task_1");
  });

  it("getTask sends GET /api/tasks/:id", async () => {
    const task = { id: "task_1", status: "completed", output: { result: 42 } };
    globalThis.fetch = mockFetch(200, { data: task }, "GET", "/api/tasks/task_1");
    const result = await consumer.getTask("task_1");
    expect(result).toEqual(task);
  });

  it("listTasks sends GET /api/tasks with query params", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain("/api/tasks");
      expect(String(url)).toContain("status=completed");
      return new Response(
        JSON.stringify({ data: { tasks: [], pagination: { hasMore: false } } }),
        { status: 200 },
      );
    });
    await consumer.listTasks({ status: "completed" });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("listEvents sends GET /api/coordinations/:id/events", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { events: [], pagination: { hasMore: false } } },
      "GET",
      "/api/coordinations/coord_1/events",
    );
    const result = await consumer.listEvents("coord_1");
    expect(result.events).toEqual([]);
  });

  // --- waitForCompletion ---

  it("waitForCompletion returns immediately if task is completed", async () => {
    const task = { id: "task_1", status: "completed", output: { done: true } };
    globalThis.fetch = mockFetch(200, { data: task });
    const result = await consumer.waitForCompletion("task_1");
    expect(result.status).toBe("completed");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("waitForCompletion returns on failed status", async () => {
    const task = { id: "task_1", status: "failed", error: "Something broke" };
    globalThis.fetch = mockFetch(200, { data: task });
    const result = await consumer.waitForCompletion("task_1");
    expect(result.status).toBe("failed");
  });

  it("waitForCompletion polls until completed", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      const status = callCount >= 3 ? "completed" : "in_progress";
      return new Response(
        JSON.stringify({ data: { id: "task_1", status, output: callCount >= 3 ? { done: true } : undefined } }),
        { status: 200 },
      );
    });
    const result = await consumer.waitForCompletion("task_1", { intervalMs: 10 });
    expect(result.status).toBe("completed");
    expect(callCount).toBe(3);
  });

  it("waitForCompletion throws AscTimeoutError on timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ data: { id: "task_1", status: "in_progress" } }),
        { status: 200 },
      );
    });
    await expect(
      consumer.waitForCompletion("task_1", { timeoutMs: 100, intervalMs: 20 }),
    ).rejects.toThrow(AscTimeoutError);
  });

  // --- Discovery ---

  it("listAgents sends GET /api/agents", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { agents: [], pagination: { hasMore: false } } },
      "GET",
      "/api/agents",
    );
    const result = await consumer.listAgents();
    expect(result.agents).toEqual([]);
  });

  it("getAgent sends GET /api/agents/:id", async () => {
    const agent = { id: "agent_1", name: "Echo" };
    globalThis.fetch = mockFetch(200, { data: agent }, "GET", "/api/agents/agent_1");
    const result = await consumer.getAgent("agent_1");
    expect(result).toEqual(agent);
  });

  it("listProviders sends GET /api/providers", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { providers: [], pagination: { hasMore: false } } },
      "GET",
      "/api/providers",
    );
    const result = await consumer.listProviders();
    expect(result.providers).toEqual([]);
  });

  // --- Billing ---

  it("listBillingEvents sends GET /api/billing-events", async () => {
    globalThis.fetch = mockFetch(200, { data: { events: [] } }, "GET", "/api/billing-events");
    const result = await consumer.listBillingEvents();
    expect(result).toEqual([]);
  });

  it("getUsageSummary sends GET /api/billing/usage with required params", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain("periodStart=2024-01-01");
      expect(String(url)).toContain("periodEnd=2024-01-31");
      return new Response(
        JSON.stringify({ data: { summary: { totalCents: 500 } } }),
        { status: 200 },
      );
    });
    const result = await consumer.getUsageSummary({
      periodStart: "2024-01-01",
      periodEnd: "2024-01-31",
    });
    expect(result).toEqual({ totalCents: 500 });
  });

  it("getMonthToDateSpend sends GET /api/billing/mtd", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { totalCents: 1234, currency: "USD" } },
      "GET",
      "/api/billing/mtd",
    );
    const result = await consumer.getMonthToDateSpend();
    expect(result).toEqual({ totalCents: 1234, currency: "USD" });
  });

  // --- Traces ---

  it("listTraces sends GET /api/traces", async () => {
    globalThis.fetch = mockFetch(200, { data: { traces: [], hasMore: false } }, "GET", "/api/traces");
    const result = await consumer.listTraces();
    expect(result.traces).toEqual([]);
  });

  it("getTrace sends GET /api/traces/:id", async () => {
    const trace = { traceId: "t_1", spans: [] };
    globalThis.fetch = mockFetch(200, { data: { trace } }, "GET", "/api/traces/t_1");
    const result = await consumer.getTrace("t_1");
    expect(result).toEqual(trace);
  });

  // --- Pipelines ---

  it("createPipeline sends POST /api/pipelines", async () => {
    const mockPipeline = { id: "pipe_1", name: "test" };
    globalThis.fetch = mockFetch(201, { data: mockPipeline }, "POST", "/api/pipelines");
    const result = await consumer.createPipeline({
      name: "test",
      steps: [{ name: "s1", agentId: "agent_1" }] as never,
    });
    expect(result).toEqual(mockPipeline);
  });

  it("getPipeline sends GET /api/pipelines/:id", async () => {
    const mockPipeline = { id: "pipe_1", name: "test" };
    globalThis.fetch = mockFetch(200, { data: mockPipeline }, "GET", "/api/pipelines/pipe_1");
    const result = await consumer.getPipeline("pipe_1");
    expect(result).toEqual(mockPipeline);
  });

  it("listPipelines sends GET /api/pipelines", async () => {
    globalThis.fetch = mockFetch(200, { data: { pipelines: [] } }, "GET", "/api/pipelines");
    const result = await consumer.listPipelines();
    expect(result.pipelines).toEqual([]);
  });

  it("deletePipeline sends DELETE /api/pipelines/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", "/api/pipelines/pipe_1");
    await consumer.deletePipeline("pipe_1");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("executePipeline sends POST /api/pipelines/:id/execute", async () => {
    const mockExec = { id: "exec_1", status: "pending" };
    globalThis.fetch = mockFetch(202, { data: mockExec }, "POST", "/api/pipelines/pipe_1/execute");
    const result = await consumer.executePipeline("pipe_1", { input: { text: "hi" } });
    expect(result).toEqual(mockExec);
  });

  it("getPipelineExecution sends GET /api/pipeline-executions/:id", async () => {
    const mockExec = { id: "exec_1", status: "completed" };
    globalThis.fetch = mockFetch(200, { data: mockExec }, "GET", "/api/pipeline-executions/exec_1");
    const result = await consumer.getPipelineExecution("exec_1");
    expect(result).toEqual(mockExec);
  });

  it("waitForPipeline polls until completed", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      const status = callCount >= 3 ? "completed" : "running";
      return new Response(
        JSON.stringify({ data: { id: "exec_1", status, output: callCount >= 3 ? { done: true } : undefined } }),
        { status: 200 },
      );
    });
    const result = await consumer.waitForPipeline("exec_1", { intervalMs: 10 });
    expect(result.status).toBe("completed");
    expect(callCount).toBe(3);
  });

  it("waitForPipeline throws on timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ data: { id: "exec_1", status: "running" } }),
        { status: 200 },
      );
    });
    await expect(
      consumer.waitForPipeline("exec_1", { timeoutMs: 100, intervalMs: 20 }),
    ).rejects.toThrow(AscTimeoutError);
  });

  // --- Error handling ---

  it("throws AscError on 401", async () => {
    globalThis.fetch = mockFetch(401, {
      error: { code: "UNAUTHORIZED", message: "Invalid API key", retryable: false },
    });
    await expect(consumer.getProfile()).rejects.toThrow(AscError);
    try {
      await consumer.getProfile();
    } catch (e) {
      const err = e as AscError;
      expect(err.code).toBe("UNAUTHORIZED");
      expect(err.statusCode).toBe(401);
    }
  });

  it("throws AscError on 403", async () => {
    globalThis.fetch = mockFetch(403, {
      error: { code: "FORBIDDEN", message: "Not your resource", retryable: false },
    });
    await expect(consumer.update({} as never)).rejects.toThrow(AscError);
  });
});

// --- Standalone registration ---

describe("registerConsumer", () => {
  it("sends POST /api/consumers without auth header", async () => {
    const response = { consumer: { id: "cons_new" }, apiKey: "asc_new_key" };
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["Authorization"]).toBeUndefined();
      return new Response(JSON.stringify({ data: response }), { status: 201 });
    });
    const result = await registerConsumer(BASE_URL, {
      name: "New Consumer",
      description: "Test",
      contactEmail: "test@test.com",
    });
    expect(result).toEqual(response);
  });
});
