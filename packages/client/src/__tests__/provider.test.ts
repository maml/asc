import { describe, it, expect, beforeEach, vi } from "vitest";
import { AscProvider, registerProvider } from "../provider.js";
import { AscError } from "../errors.js";
import type { ProviderId } from "../types.js";

const BASE_URL = "http://localhost:3100";
const API_KEY = "asc_test_provider_key";
const PROVIDER_ID = "prov_123" as ProviderId;

function mockFetch(
  status: number,
  body: unknown,
  expectedMethod?: string,
  expectedPath?: string,
) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (expectedMethod) {
      expect(init?.method).toBe(expectedMethod);
    }
    if (expectedPath) {
      expect(String(url)).toContain(expectedPath);
    }
    return new Response(
      status === 204 ? null : JSON.stringify(body),
      { status, headers: { "Content-Type": "application/json" } },
    );
  });
}

describe("AscProvider", () => {
  let provider: AscProvider;

  beforeEach(() => {
    provider = new AscProvider({ baseUrl: BASE_URL, apiKey: API_KEY, providerId: PROVIDER_ID });
    vi.restoreAllMocks();
  });

  // --- Auth header ---

  it("sends Authorization header on every request", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${API_KEY}`,
      );
      return new Response(JSON.stringify({ data: { id: PROVIDER_ID } }), { status: 200 });
    });
    await provider.getProfile();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Self management ---

  it("getProfile sends GET /api/providers/:id", async () => {
    const mockProvider = { id: PROVIDER_ID, name: "Test" };
    globalThis.fetch = mockFetch(200, { data: mockProvider }, "GET", `/api/providers/${PROVIDER_ID}`);
    const result = await provider.getProfile();
    expect(result).toEqual(mockProvider);
  });

  it("update sends PATCH /api/providers/:id", async () => {
    const updated = { id: PROVIDER_ID, name: "Updated", status: "active" };
    globalThis.fetch = mockFetch(200, { data: updated }, "PATCH", `/api/providers/${PROVIDER_ID}`);
    const result = await provider.update({ status: "active" } as never);
    expect(result).toEqual(updated);
  });

  it("delete sends DELETE /api/providers/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", `/api/providers/${PROVIDER_ID}`);
    await provider.delete();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Agent management ---

  it("registerAgent sends POST /api/providers/:id/agents", async () => {
    const agent = { id: "agent_1", name: "Echo" };
    globalThis.fetch = mockFetch(
      201,
      { data: { agent } },
      "POST",
      `/api/providers/${PROVIDER_ID}/agents`,
    );
    const result = await provider.registerAgent({
      name: "Echo",
      description: "Echoes input",
      version: "1.0.0",
      capabilities: [{ name: "echo", description: "Echo", inputSchema: {}, outputSchema: {} }],
      pricing: { type: "per_invocation", pricePerCall: { amountCents: 10, currency: "USD" } },
      sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
      supportsStreaming: false,
    });
    expect(result).toEqual(agent);
  });

  it("listAgents includes providerId query param", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(String(url)).toContain(`providerId=${PROVIDER_ID}`);
      return new Response(
        JSON.stringify({ data: { agents: [], pagination: { hasMore: false } } }),
        { status: 200 },
      );
    });
    await provider.listAgents();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("getAgent sends GET /api/agents/:id", async () => {
    const agent = { id: "agent_1", name: "Echo" };
    globalThis.fetch = mockFetch(200, { data: agent }, "GET", "/api/agents/agent_1");
    const result = await provider.getAgent("agent_1");
    expect(result).toEqual(agent);
  });

  it("updateAgent sends PATCH /api/agents/:id", async () => {
    const agent = { id: "agent_1", status: "active" };
    globalThis.fetch = mockFetch(200, { data: agent }, "PATCH", "/api/agents/agent_1");
    const result = await provider.updateAgent("agent_1", { status: "active" } as never);
    expect(result).toEqual(agent);
  });

  it("deleteAgent sends DELETE /api/agents/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", "/api/agents/agent_1");
    await provider.deleteAgent("agent_1");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Discovery ---

  it("listProviders sends GET /api/providers", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { providers: [], pagination: { hasMore: false } } },
      "GET",
      "/api/providers",
    );
    const result = await provider.listProviders();
    expect(result.providers).toEqual([]);
  });

  it("listConsumers sends GET /api/consumers", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { consumers: [], pagination: { hasMore: false } } },
      "GET",
      "/api/consumers",
    );
    const result = await provider.listConsumers();
    expect(result.consumers).toEqual([]);
  });

  // --- SLA ---

  it("createSlaRule sends POST /api/sla-rules", async () => {
    const rule = { id: "rule_1", metricType: "latency" };
    globalThis.fetch = mockFetch(201, { data: { rule } }, "POST", "/api/sla-rules");
    const result = await provider.createSlaRule({
      agentId: "agent_1",
      providerId: PROVIDER_ID,
      metricType: "latency",
      threshold: 500,
    });
    expect(result).toEqual(rule);
  });

  it("listSlaRules sends GET /api/sla-rules", async () => {
    globalThis.fetch = mockFetch(200, { data: { rules: [] } }, "GET", "/api/sla-rules");
    const result = await provider.listSlaRules();
    expect(result).toEqual([]);
  });

  it("deleteSlaRule sends DELETE /api/sla-rules/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", "/api/sla-rules/rule_1");
    await provider.deleteSlaRule("rule_1");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("evaluateSlaRules sends POST /api/sla-rules/evaluate", async () => {
    globalThis.fetch = mockFetch(200, { data: { records: [] } }, "POST", "/api/sla-rules/evaluate");
    const result = await provider.evaluateSlaRules("agent_1");
    expect(result).toEqual([]);
  });

  // --- Quality Gates ---

  it("createQualityGate sends POST /api/quality-gates", async () => {
    const gate = { id: "gate_1", name: "Schema Check" };
    globalThis.fetch = mockFetch(201, { data: { gate } }, "POST", "/api/quality-gates");
    const result = await provider.createQualityGate({
      agentId: "agent_1",
      name: "Schema Check",
      checkConfig: { type: "json_schema", schema: {} },
    });
    expect(result).toEqual(gate);
  });

  it("listQualityGates sends GET /api/quality-gates", async () => {
    globalThis.fetch = mockFetch(200, { data: { gates: [] } }, "GET", "/api/quality-gates");
    const result = await provider.listQualityGates();
    expect(result).toEqual([]);
  });

  it("deleteQualityGate sends DELETE /api/quality-gates/:id", async () => {
    globalThis.fetch = mockFetch(204, null, "DELETE", "/api/quality-gates/gate_1");
    await provider.deleteQualityGate("gate_1");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  // --- Traces ---

  it("listTraces sends GET /api/traces", async () => {
    globalThis.fetch = mockFetch(
      200,
      { data: { traces: [], hasMore: false } },
      "GET",
      "/api/traces",
    );
    const result = await provider.listTraces();
    expect(result.traces).toEqual([]);
  });

  it("getTrace sends GET /api/traces/:id", async () => {
    const trace = { traceId: "t_1", spans: [] };
    globalThis.fetch = mockFetch(200, { data: { trace } }, "GET", "/api/traces/t_1");
    const result = await provider.getTrace("t_1");
    expect(result).toEqual(trace);
  });

  // --- Error handling ---

  it("throws AscError on 4xx response", async () => {
    globalThis.fetch = mockFetch(404, {
      error: { code: "NOT_FOUND", message: "Provider not found", retryable: false },
    });
    await expect(provider.getProfile()).rejects.toThrow(AscError);
    try {
      await provider.getProfile();
    } catch (e) {
      const err = e as AscError;
      expect(err.code).toBe("NOT_FOUND");
      expect(err.statusCode).toBe(404);
      expect(err.retryable).toBe(false);
    }
  });

  it("throws AscError on 500 response", async () => {
    globalThis.fetch = mockFetch(500, {
      error: { code: "INTERNAL", message: "Server error", retryable: true },
    });
    await expect(provider.getProfile()).rejects.toThrow(AscError);
  });
});

// --- Standalone registration ---

describe("registerProvider", () => {
  it("sends POST /api/providers without auth header", async () => {
    const response = { provider: { id: "prov_new" }, apiKey: "asc_new_key" };
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["Authorization"]).toBeUndefined();
      return new Response(JSON.stringify({ data: response }), { status: 201 });
    });
    const result = await registerProvider(BASE_URL, {
      name: "New Provider",
      description: "Test",
      contactEmail: "test@test.com",
      webhookUrl: "http://localhost:9999",
    });
    expect(result).toEqual(response);
  });
});
