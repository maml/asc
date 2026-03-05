import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@asc-so/client", () => ({
  AscError: class extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;
    constructor(c: string, m: string, s: number, r: boolean) {
      super(m);
      this.code = c;
      this.statusCode = s;
      this.retryable = r;
    }
  },
  AscTimeoutError: class extends Error {},
}));

import { register } from "../tools/observability.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, ToolHandler>();
const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    tools.set(args[0] as string, args[args.length - 1] as ToolHandler);
  }),
};

const mockProvider = {
  providerId: "prv_test",
  listTraces: vi.fn().mockResolvedValue([{ traceId: "trc_1" }]),
  getTrace: vi.fn().mockResolvedValue({ traceId: "trc_1", spans: [] }),
  createSlaRule: vi.fn().mockResolvedValue({ id: "sla_1" }),
  listSlaRules: vi.fn().mockResolvedValue([{ id: "sla_1" }]),
  deleteSlaRule: vi.fn().mockResolvedValue(undefined),
  evaluateSlaRules: vi.fn().mockResolvedValue({ compliant: true }),
  createQualityGate: vi.fn().mockResolvedValue({ id: "qg_1" }),
  listQualityGates: vi.fn().mockResolvedValue([{ id: "qg_1" }]),
  deleteQualityGate: vi.fn().mockResolvedValue(undefined),
  listQualityChecks: vi.fn().mockResolvedValue([{ id: "qc_1", passed: true }]),
};

const mockConsumer = {
  consumerId: "con_test",
  listTraces: vi.fn().mockResolvedValue([{ traceId: "trc_2" }]),
  getTrace: vi.fn().mockResolvedValue({ traceId: "trc_2", spans: [] }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  tools.clear();
  mockServer.tool.mockClear();

  // Reset mocks
  mockProvider.listTraces.mockResolvedValue([{ traceId: "trc_1" }]);
  mockProvider.getTrace.mockResolvedValue({ traceId: "trc_1", spans: [] });
  mockProvider.createSlaRule.mockResolvedValue({ id: "sla_1" });
  mockProvider.listSlaRules.mockResolvedValue([{ id: "sla_1" }]);
  mockProvider.deleteSlaRule.mockResolvedValue(undefined);
  mockProvider.evaluateSlaRules.mockResolvedValue({ compliant: true });
  mockProvider.createQualityGate.mockResolvedValue({ id: "qg_1" });
  mockProvider.listQualityGates.mockResolvedValue([{ id: "qg_1" }]);
  mockProvider.deleteQualityGate.mockResolvedValue(undefined);
  mockProvider.listQualityChecks.mockResolvedValue([{ id: "qc_1", passed: true }]);
  mockConsumer.listTraces.mockResolvedValue([{ traceId: "trc_2" }]);
  mockConsumer.getTrace.mockResolvedValue({ traceId: "trc_2", spans: [] });
});

function setup(opts: {
  provider?: Clients["provider"];
  consumer?: Clients["consumer"];
} = {}): void {
  const clients: Clients = {
    baseUrl: "http://localhost:3100",
    consumer: opts.consumer ?? null,
    provider: opts.provider ?? null,
  };
  register(mockServer as never, clients);
}

describe("observability tools", () => {
  describe("asc_observability_list_traces", () => {
    it("prefers provider when available", async () => {
      setup({
        provider: mockProvider as unknown as Clients["provider"],
        consumer: mockConsumer as unknown as Clients["consumer"],
      });
      const handler = tools.get("asc_observability_list_traces")!;
      const result = await handler({ limit: 5 });

      expect(mockProvider.listTraces).toHaveBeenCalledWith({ limit: 5 });
      expect(mockConsumer.listTraces).not.toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ traceId: "trc_1" }], null, 2) }],
      });
    });

    it("falls back to consumer when no provider", async () => {
      setup({ consumer: mockConsumer as unknown as Clients["consumer"] });
      const handler = tools.get("asc_observability_list_traces")!;
      const result = await handler({ limit: 10 });

      expect(mockConsumer.listTraces).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ traceId: "trc_2" }], null, 2) }],
      });
    });
  });

  describe("asc_observability_get_trace", () => {
    it("prefers provider when available", async () => {
      setup({
        provider: mockProvider as unknown as Clients["provider"],
        consumer: mockConsumer as unknown as Clients["consumer"],
      });
      const handler = tools.get("asc_observability_get_trace")!;
      const result = await handler({ traceId: "trc_1" });

      expect(mockProvider.getTrace).toHaveBeenCalledWith("trc_1");
      expect(mockConsumer.getTrace).not.toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ traceId: "trc_1", spans: [] }, null, 2) }],
      });
    });
  });

  describe("asc_observability_create_sla_rule", () => {
    it("calls provider.createSlaRule with providerId injected", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_create_sla_rule")!;
      await handler({
        agentId: "agt_1",
        metricType: "latency",
        threshold: 500,
        windowMinutes: 60,
      });

      expect(mockProvider.createSlaRule).toHaveBeenCalledWith({
        agentId: "agt_1",
        metricType: "latency",
        threshold: 500,
        windowMinutes: 60,
        providerId: "prv_test",
      });
    });
  });

  describe("asc_observability_list_sla_rules", () => {
    it("calls provider.listSlaRules", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_list_sla_rules")!;
      const result = await handler({ agentId: "agt_1", limit: 5 });

      expect(mockProvider.listSlaRules).toHaveBeenCalledWith({ agentId: "agt_1", limit: 5 });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "sla_1" }], null, 2) }],
      });
    });
  });

  describe("asc_observability_delete_sla_rule", () => {
    it("calls provider.deleteSlaRule and returns success", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_delete_sla_rule")!;
      const result = await handler({ ruleId: "sla_1" });

      expect(mockProvider.deleteSlaRule).toHaveBeenCalledWith("sla_1");
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
      });
    });
  });

  describe("asc_observability_evaluate_sla", () => {
    it("calls provider.evaluateSlaRules", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_evaluate_sla")!;
      const result = await handler({ agentId: "agt_1" });

      expect(mockProvider.evaluateSlaRules).toHaveBeenCalledWith("agt_1");
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ compliant: true }, null, 2) }],
      });
    });
  });

  describe("asc_observability_create_quality_gate", () => {
    it("calls provider.createQualityGate", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_create_quality_gate")!;
      const params = {
        agentId: "agt_1",
        name: "latency-check",
        description: "Must respond within 500ms",
        checkConfig: { type: "latency_threshold", maxMs: 500 },
        required: true,
      };
      const result = await handler(params);

      expect(mockProvider.createQualityGate).toHaveBeenCalledWith(params);
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ id: "qg_1" }, null, 2) }],
      });
    });
  });

  describe("asc_observability_list_quality_gates", () => {
    it("calls provider.listQualityGates", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_list_quality_gates")!;
      const result = await handler({ agentId: "agt_1", limit: 10 });

      expect(mockProvider.listQualityGates).toHaveBeenCalledWith({ agentId: "agt_1", limit: 10 });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "qg_1" }], null, 2) }],
      });
    });
  });

  describe("asc_observability_delete_quality_gate", () => {
    it("calls provider.deleteQualityGate and returns success", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_delete_quality_gate")!;
      const result = await handler({ gateId: "qg_1" });

      expect(mockProvider.deleteQualityGate).toHaveBeenCalledWith("qg_1");
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
      });
    });
  });

  describe("asc_observability_list_quality_checks", () => {
    it("calls provider.listQualityChecks", async () => {
      setup({ provider: mockProvider as unknown as Clients["provider"] });
      const handler = tools.get("asc_observability_list_quality_checks")!;
      const result = await handler({ gateId: "qg_1", taskId: "tsk_1", limit: 20 });

      expect(mockProvider.listQualityChecks).toHaveBeenCalledWith({
        gateId: "qg_1",
        taskId: "tsk_1",
        limit: 20,
      });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "qc_1", passed: true }], null, 2) }],
      });
    });
  });

  describe("provider-only tools with no provider", () => {
    it("returns error for provider-required tools when provider is null", async () => {
      setup({ consumer: mockConsumer as unknown as Clients["consumer"] });

      const providerTools = [
        "asc_observability_create_sla_rule",
        "asc_observability_list_sla_rules",
        "asc_observability_delete_sla_rule",
        "asc_observability_evaluate_sla",
        "asc_observability_create_quality_gate",
        "asc_observability_list_quality_gates",
        "asc_observability_delete_quality_gate",
        "asc_observability_list_quality_checks",
      ];

      for (const toolName of providerTools) {
        const handler = tools.get(toolName)!;
        const result = (await handler({})) as {
          content: Array<{ text: string }>;
          isError: boolean;
        };

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Provider credentials required");
      }
    });
  });
});
