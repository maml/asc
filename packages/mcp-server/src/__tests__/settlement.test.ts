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

import { register } from "../tools/settlement.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, ToolHandler>();
const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    tools.set(args[0] as string, args[args.length - 1] as ToolHandler);
  }),
};

const mockProvider = {
  providerId: "prov_test",
  listSettlements: vi.fn().mockResolvedValue([{ id: "stl_1" }]),
  getSettlementSummary: vi.fn().mockResolvedValue({ totalGrossCents: 5000, settlementCount: 3 }),
  getSettlementConfig: vi.fn().mockResolvedValue({ network: "lightning", enabled: true }),
  updateSettlementConfig: vi.fn().mockResolvedValue({ network: "lightning", enabled: true }),
};

const mockConsumer = {
  consumerId: "con_test",
  listSettlements: vi.fn().mockResolvedValue([{ id: "stl_2" }]),
};

beforeEach(() => {
  vi.restoreAllMocks();
  tools.clear();
  mockServer.tool.mockClear();
  mockProvider.listSettlements.mockResolvedValue([{ id: "stl_1" }]);
  mockProvider.getSettlementSummary.mockResolvedValue({ totalGrossCents: 5000, settlementCount: 3 });
  mockProvider.getSettlementConfig.mockResolvedValue({ network: "lightning", enabled: true });
  mockProvider.updateSettlementConfig.mockResolvedValue({ network: "lightning", enabled: true });
  mockConsumer.listSettlements.mockResolvedValue([{ id: "stl_2" }]);
  process.env["ASC_PROVIDER_API_KEY"] = "asc_test_prov_key";
});

function setup(opts?: {
  provider?: Clients["provider"];
  consumer?: Clients["consumer"];
}): void {
  const clients: Clients = {
    baseUrl: "http://localhost:3100",
    provider: opts?.provider !== undefined ? opts.provider : (mockProvider as unknown as Clients["provider"]),
    consumer: opts?.consumer !== undefined ? opts.consumer : (mockConsumer as unknown as Clients["consumer"]),
  };
  register(mockServer as never, clients);
}

describe("settlement tools", () => {
  describe("asc_settlement_list", () => {
    it("calls provider.listSettlements when provider is available", async () => {
      setup();
      const handler = tools.get("asc_settlement_list")!;
      const result = await handler({ status: "settled" });

      expect(mockProvider.listSettlements).toHaveBeenCalledWith({ status: "settled" });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "stl_1" }], null, 2) }],
      });
    });

    it("falls back to consumer.listSettlements when no provider", async () => {
      setup({ provider: null });
      const handler = tools.get("asc_settlement_list")!;
      const result = await handler({});

      expect(mockConsumer.listSettlements).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "stl_2" }], null, 2) }],
      });
    });

    it("returns error when neither provider nor consumer", async () => {
      setup({ provider: null, consumer: null });
      const handler = tools.get("asc_settlement_list")!;
      const result = (await handler({})) as { isError: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("credentials required");
    });
  });

  describe("asc_settlement_get_summary", () => {
    it("calls provider.getSettlementSummary", async () => {
      setup();
      const handler = tools.get("asc_settlement_get_summary")!;
      const result = await handler({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });

      expect(mockProvider.getSettlementSummary).toHaveBeenCalledWith({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ totalGrossCents: 5000, settlementCount: 3 }, null, 2) }],
      });
    });

    it("returns error when no provider", async () => {
      setup({ provider: null });
      const handler = tools.get("asc_settlement_get_summary")!;
      const result = (await handler({ periodStart: "2026-01-01", periodEnd: "2026-01-31" })) as { isError: boolean };
      expect(result.isError).toBe(true);
    });
  });

  describe("asc_settlement_get_config", () => {
    it("calls provider.getSettlementConfig", async () => {
      setup();
      const handler = tools.get("asc_settlement_get_config")!;
      const result = await handler({});

      expect(mockProvider.getSettlementConfig).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ network: "lightning", enabled: true }, null, 2) }],
      });
    });
  });

  describe("asc_settlement_update_config", () => {
    it("calls provider.updateSettlementConfig", async () => {
      setup();
      const handler = tools.get("asc_settlement_update_config")!;
      const result = await handler({
        network: "lightning",
        lightningAddress: "user@strike.me",
        enabled: true,
      });

      expect(mockProvider.updateSettlementConfig).toHaveBeenCalledWith({
        network: "lightning",
        lightningAddress: "user@strike.me",
        enabled: true,
      });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ network: "lightning", enabled: true }, null, 2) }],
      });
    });
  });

  describe("asc_settlement_reconcile", () => {
    it("calls POST /api/settlements/reconcile", async () => {
      setup();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { result: { attempted: 0, settled: 0, failed: 0 } } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_settlement_reconcile")!;
      const result = await handler({});

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/settlements/reconcile",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ result: { attempted: 0, settled: 0, failed: 0 } }, null, 2) }],
      });

      vi.unstubAllGlobals();
    });
  });
});
