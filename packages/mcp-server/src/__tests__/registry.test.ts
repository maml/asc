import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @asc/client
vi.mock("@asc/client", () => ({
  registerProvider: vi.fn(),
  registerConsumer: vi.fn(),
  AscError: class AscError extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;
    constructor(code: string, msg: string, status: number, retryable: boolean) {
      super(msg);
      this.code = code;
      this.statusCode = status;
      this.retryable = retryable;
    }
  },
  AscTimeoutError: class extends Error {},
}));

import { registerProvider, registerConsumer } from "@asc/client";
import { register } from "../tools/registry.js";
import type { Clients } from "../clients.js";

// Capture tool handlers registered via server.tool()
type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
const tools = new Map<string, ToolHandler>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    // server.tool(name, description, schema, handler) — handler is always last arg
    const name = args[0] as string;
    const handler = args[args.length - 1] as ToolHandler;
    tools.set(name, handler);
  }),
};

function makeClients(overrides: Partial<Clients> = {}): Clients {
  return {
    baseUrl: "http://localhost:3100",
    consumer: {
      consumerId: "con_test" as any,
      listProviders: vi.fn(),
      getAgent: vi.fn(),
      getAgentStats: vi.fn(),
      listAgents: vi.fn(),
    } as any,
    provider: {
      providerId: "prv_test" as any,
      getProfile: vi.fn(),
      listProviders: vi.fn(),
      listConsumers: vi.fn(),
      registerAgent: vi.fn(),
      getAgent: vi.fn(),
      getAgentStats: vi.fn(),
      listAgents: vi.fn(),
      updateAgent: vi.fn(),
      deleteAgent: vi.fn(),
    } as any,
    ...overrides,
  };
}

/** Parse the JSON text from an MCP tool result */
function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("registry tools", () => {
  beforeEach(() => {
    tools.clear();
    mockServer.tool.mockClear();
    vi.restoreAllMocks();
  });

  it("registers all 12 tools", () => {
    const clients = makeClients();
    register(mockServer as any, clients);
    expect(mockServer.tool).toHaveBeenCalledTimes(12);
    expect(tools.size).toBe(12);
  });

  // ---- 1. asc_registry_register_provider ----
  describe("asc_registry_register_provider", () => {
    it("calls registerProvider standalone fn with baseUrl and params", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const mockResult = { providerId: "prv_new", apiKey: "asc_prv_key" };
      (registerProvider as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const handler = tools.get("asc_registry_register_provider")!;
      const params = {
        name: "TestOrg",
        description: "A test provider",
        contactEmail: "test@example.com",
        webhookUrl: "https://example.com/hook",
      };

      const result = await handler(params);
      expect(registerProvider).toHaveBeenCalledWith("http://localhost:3100", params);
      expect(parseResult(result)).toEqual(mockResult);
      expect(result).not.toHaveProperty("isError");
    });
  });

  // ---- 2. asc_registry_get_provider ----
  describe("asc_registry_get_provider", () => {
    it("fetches provider by ID via raw fetch", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const providerData = { id: "prv_123", name: "Provider" };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: providerData }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_registry_get_provider")!;
      const result = await handler({ providerId: "prv_123" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/providers/prv_123",
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(parseResult(result)).toEqual(providerData);
    });

    it("returns error on non-ok response", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: "Not found" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_registry_get_provider")!;
      const result: any = await handler({ providerId: "prv_bad" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  // ---- 3. asc_registry_list_providers ----
  describe("asc_registry_list_providers", () => {
    it("calls consumer.listProviders when consumer is available", async () => {
      const clients = makeClients();
      const providers = [{ id: "prv_1" }, { id: "prv_2" }];
      (clients.consumer!.listProviders as ReturnType<typeof vi.fn>).mockResolvedValue(providers);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_providers")!;
      const result = await handler({ limit: 10 });

      expect(clients.consumer!.listProviders).toHaveBeenCalledWith({ limit: 10 });
      expect(parseResult(result)).toEqual(providers);
    });

    it("falls back to provider.listProviders when no consumer", async () => {
      const clients = makeClients({ consumer: null });
      const providers = [{ id: "prv_1" }];
      (clients.provider!.listProviders as ReturnType<typeof vi.fn>).mockResolvedValue(providers);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_providers")!;
      const result = await handler({});

      expect(clients.provider!.listProviders).toHaveBeenCalledWith({});
      expect(parseResult(result)).toEqual(providers);
    });

    it("returns error when no credentials configured", async () => {
      const clients = makeClients({ consumer: null, provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_list_providers")!;
      const result: any = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No credentials configured");
    });
  });

  // ---- 4. asc_registry_register_consumer ----
  describe("asc_registry_register_consumer", () => {
    it("calls registerConsumer standalone fn with baseUrl and params", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const mockResult = { consumerId: "con_new", apiKey: "asc_con_key" };
      (registerConsumer as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const handler = tools.get("asc_registry_register_consumer")!;
      const params = {
        name: "TestConsumer",
        description: "A test consumer",
        contactEmail: "consumer@example.com",
      };

      const result = await handler(params);
      expect(registerConsumer).toHaveBeenCalledWith("http://localhost:3100", params);
      expect(parseResult(result)).toEqual(mockResult);
    });
  });

  // ---- 5. asc_registry_get_consumer ----
  describe("asc_registry_get_consumer", () => {
    it("fetches consumer by ID via raw fetch", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const consumerData = { id: "con_123", name: "Consumer" };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: consumerData }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_registry_get_consumer")!;
      const result = await handler({ consumerId: "con_123" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/consumers/con_123",
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(parseResult(result)).toEqual(consumerData);
    });

    it("returns error on non-ok response", async () => {
      const clients = makeClients();
      register(mockServer as any, clients);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: "Consumer not found" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_registry_get_consumer")!;
      const result: any = await handler({ consumerId: "con_bad" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Consumer not found");
    });
  });

  // ---- 6. asc_registry_list_consumers ----
  describe("asc_registry_list_consumers", () => {
    it("calls provider.listConsumers", async () => {
      const clients = makeClients();
      const consumers = [{ id: "con_1" }];
      (clients.provider!.listConsumers as ReturnType<typeof vi.fn>).mockResolvedValue(consumers);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_consumers")!;
      const result = await handler({});

      expect(clients.provider!.listConsumers).toHaveBeenCalledWith({});
      expect(parseResult(result)).toEqual(consumers);
    });

    it("returns error when no provider credentials", async () => {
      const clients = makeClients({ provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_list_consumers")!;
      const result: any = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Provider credentials required");
    });
  });

  // ---- 7. asc_registry_register_agent ----
  describe("asc_registry_register_agent", () => {
    it("calls provider.registerAgent with params", async () => {
      const clients = makeClients();
      const agentResult = { agentId: "agt_new", name: "TestAgent" };
      (clients.provider!.registerAgent as ReturnType<typeof vi.fn>).mockResolvedValue(agentResult);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_register_agent")!;

      const params = {
        name: "TestAgent",
        description: "Does stuff",
        version: "1.0.0",
        capabilities: [
          {
            name: "summarize",
            description: "Summarizes text",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
          },
        ],
        pricing: {
          type: "per_invocation",
          pricePerCall: { amountCents: 10, currency: "USD" },
        },
        sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
        supportsStreaming: false,
      };

      const result = await handler(params);
      expect(clients.provider!.registerAgent).toHaveBeenCalledWith(params);
      expect(parseResult(result)).toEqual(agentResult);
    });

    it("returns error when no provider credentials", async () => {
      const clients = makeClients({ provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_register_agent")!;
      const result: any = await handler({ name: "Agent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Provider credentials required");
    });
  });

  // ---- 8. asc_registry_get_agent ----
  describe("asc_registry_get_agent", () => {
    it("prefers consumer.getAgent when consumer is available", async () => {
      const clients = makeClients();
      const agentData = { id: "agt_1", name: "Agent1" };
      (clients.consumer!.getAgent as ReturnType<typeof vi.fn>).mockResolvedValue(agentData);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_get_agent")!;
      const result = await handler({ agentId: "agt_1" });

      expect(clients.consumer!.getAgent).toHaveBeenCalledWith("agt_1");
      expect(clients.provider!.getAgent).not.toHaveBeenCalled();
      expect(parseResult(result)).toEqual(agentData);
    });

    it("falls back to provider.getAgent when no consumer", async () => {
      const clients = makeClients({ consumer: null });
      const agentData = { id: "agt_1", name: "Agent1" };
      (clients.provider!.getAgent as ReturnType<typeof vi.fn>).mockResolvedValue(agentData);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_get_agent")!;
      const result = await handler({ agentId: "agt_1" });

      expect(clients.provider!.getAgent).toHaveBeenCalledWith("agt_1");
      expect(parseResult(result)).toEqual(agentData);
    });

    it("returns error when no credentials configured", async () => {
      const clients = makeClients({ consumer: null, provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_get_agent")!;
      const result: any = await handler({ agentId: "agt_1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No credentials configured");
    });
  });

  // ---- 9. asc_registry_list_agents ----
  describe("asc_registry_list_agents", () => {
    it("prefers consumer.listAgents when consumer is available", async () => {
      const clients = makeClients();
      const agents = [{ id: "agt_1" }, { id: "agt_2" }];
      (clients.consumer!.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue(agents);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_agents")!;
      const result = await handler({ limit: 5 });

      expect(clients.consumer!.listAgents).toHaveBeenCalledWith({ limit: 5 });
      expect(clients.provider!.listAgents).not.toHaveBeenCalled();
      expect(parseResult(result)).toEqual(agents);
    });

    it("falls back to provider.listAgents when no consumer", async () => {
      const clients = makeClients({ consumer: null });
      const agents = [{ id: "agt_1" }];
      (clients.provider!.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue(agents);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_agents")!;
      const result = await handler({});

      expect(clients.provider!.listAgents).toHaveBeenCalledWith({});
      expect(parseResult(result)).toEqual(agents);
    });

    it("returns error when no credentials configured", async () => {
      const clients = makeClients({ consumer: null, provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_list_agents")!;
      const result: any = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No credentials configured");
    });
  });

  // ---- 9b. asc_registry_list_agents (marketplace params) ----
  describe("asc_registry_list_agents marketplace params", () => {
    it("passes search, pricingType, sort, sortDir to consumer.listAgents", async () => {
      const clients = makeClients();
      const agents = [{ id: "agt_1", name: "DocAgent" }];
      (clients.consumer!.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue(agents);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_list_agents")!;
      const result = await handler({
        search: "doc",
        pricingType: "per_invocation",
        sort: "name",
        sortDir: "asc",
        status: "active",
      });

      expect(clients.consumer!.listAgents).toHaveBeenCalledWith({
        search: "doc",
        pricingType: "per_invocation",
        sort: "name",
        sortDir: "asc",
        status: "active",
      });
      expect(parseResult(result)).toEqual(agents);
    });
  });

  // ---- 9c. asc_registry_get_agent_stats ----
  describe("asc_registry_get_agent_stats", () => {
    it("prefers consumer.getAgentStats when consumer is available", async () => {
      const clients = makeClients();
      const stats = { totalInvocations: 42, successRate: 0.95, avgLatencyMs: 200, last30Days: { invocations: 10, revenue: 500 } };
      (clients.consumer!.getAgentStats as ReturnType<typeof vi.fn>).mockResolvedValue(stats);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_get_agent_stats")!;
      const result = await handler({ agentId: "agt_1" });

      expect(clients.consumer!.getAgentStats).toHaveBeenCalledWith("agt_1");
      expect(parseResult(result)).toEqual(stats);
    });

    it("falls back to provider.getAgentStats when no consumer", async () => {
      const clients = makeClients({ consumer: null });
      const stats = { totalInvocations: 10, successRate: 1.0, avgLatencyMs: 100, last30Days: { invocations: 5, revenue: 200 } };
      (clients.provider!.getAgentStats as ReturnType<typeof vi.fn>).mockResolvedValue(stats);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_get_agent_stats")!;
      const result = await handler({ agentId: "agt_1" });

      expect(clients.provider!.getAgentStats).toHaveBeenCalledWith("agt_1");
      expect(parseResult(result)).toEqual(stats);
    });

    it("returns error when no credentials configured", async () => {
      const clients = makeClients({ consumer: null, provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_get_agent_stats")!;
      const result: any = await handler({ agentId: "agt_1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No credentials configured");
    });
  });

  // ---- 10. asc_registry_update_agent ----
  describe("asc_registry_update_agent", () => {
    it("calls provider.updateAgent with agentId and fields", async () => {
      const clients = makeClients();
      const updated = { id: "agt_1", name: "UpdatedAgent" };
      (clients.provider!.updateAgent as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_update_agent")!;
      const result = await handler({ agentId: "agt_1", name: "UpdatedAgent", description: "New desc" });

      expect(clients.provider!.updateAgent).toHaveBeenCalledWith("agt_1", {
        name: "UpdatedAgent",
        description: "New desc",
      });
      expect(parseResult(result)).toEqual(updated);
    });

    it("returns error when no provider credentials", async () => {
      const clients = makeClients({ provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_update_agent")!;
      const result: any = await handler({ agentId: "agt_1", name: "X" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Provider credentials required");
    });
  });

  // ---- 11. asc_registry_delete_agent ----
  describe("asc_registry_delete_agent", () => {
    it("calls provider.deleteAgent and returns success:true", async () => {
      const clients = makeClients();
      (clients.provider!.deleteAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      register(mockServer as any, clients);
      const handler = tools.get("asc_registry_delete_agent")!;
      const result = await handler({ agentId: "agt_1" });

      expect(clients.provider!.deleteAgent).toHaveBeenCalledWith("agt_1");
      expect(parseResult(result)).toEqual({ success: true });
    });

    it("returns error when no provider credentials", async () => {
      const clients = makeClients({ provider: null });
      register(mockServer as any, clients);

      const handler = tools.get("asc_registry_delete_agent")!;
      const result: any = await handler({ agentId: "agt_1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Provider credentials required");
    });
  });
});
