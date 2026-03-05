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

import { register } from "../tools/billing.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, ToolHandler>();
const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    tools.set(args[0] as string, args[args.length - 1] as ToolHandler);
  }),
};

const mockConsumer = {
  consumerId: "con_test",
  listBillingEvents: vi.fn().mockResolvedValue([{ id: "evt_1" }]),
  getUsageSummary: vi.fn().mockResolvedValue({ totalCents: 500 }),
  getMonthToDateSpend: vi.fn().mockResolvedValue({ spendCents: 1200 }),
};

beforeEach(() => {
  vi.restoreAllMocks();
  tools.clear();
  mockServer.tool.mockClear();
  mockConsumer.listBillingEvents.mockResolvedValue([{ id: "evt_1" }]);
  mockConsumer.getUsageSummary.mockResolvedValue({ totalCents: 500 });
  mockConsumer.getMonthToDateSpend.mockResolvedValue({ spendCents: 1200 });
  process.env["ASC_CONSUMER_API_KEY"] = "asc_test_key";
});

function setup(consumer = mockConsumer as unknown as Clients["consumer"]): void {
  const clients: Clients = {
    baseUrl: "http://localhost:3100",
    consumer,
    provider: null,
  };
  register(mockServer as never, clients);
}

describe("billing tools", () => {
  describe("asc_billing_list_events", () => {
    it("calls consumer.listBillingEvents with params", async () => {
      setup();
      const handler = tools.get("asc_billing_list_events")!;
      const result = await handler({ agentId: "agt_1", limit: 10 });

      expect(mockConsumer.listBillingEvents).toHaveBeenCalledWith({
        agentId: "agt_1",
        limit: 10,
      });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify([{ id: "evt_1" }], null, 2) }],
      });
    });
  });

  describe("asc_billing_get_usage", () => {
    it("calls consumer.getUsageSummary with params", async () => {
      setup();
      const handler = tools.get("asc_billing_get_usage")!;
      const result = await handler({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        agentId: "agt_2",
      });

      expect(mockConsumer.getUsageSummary).toHaveBeenCalledWith({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        agentId: "agt_2",
      });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ totalCents: 500 }, null, 2) }],
      });
    });
  });

  describe("asc_billing_get_mtd", () => {
    it("calls consumer.getMonthToDateSpend", async () => {
      setup();
      const handler = tools.get("asc_billing_get_mtd")!;
      const result = await handler({});

      expect(mockConsumer.getMonthToDateSpend).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ spendCents: 1200 }, null, 2) }],
      });
    });
  });

  describe("asc_billing_create_invoice", () => {
    it("calls fetch POST to /api/invoices with consumerId in body", async () => {
      setup();
      const invoiceData = { id: "inv_1", status: "draft" };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: invoiceData }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_billing_create_invoice")!;
      const result = await handler({
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/invoices",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer asc_test_key",
          },
          body: JSON.stringify({
            consumerId: "con_test",
            periodStart: "2026-01-01",
            periodEnd: "2026-01-31",
          }),
        }
      );
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(invoiceData, null, 2) }],
      });

      vi.unstubAllGlobals();
    });
  });

  describe("asc_billing_list_invoices", () => {
    it("calls fetch GET to /api/invoices with query params", async () => {
      setup();
      const invoices = [{ id: "inv_1" }, { id: "inv_2" }];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: invoices }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const handler = tools.get("asc_billing_list_invoices")!;
      const result = await handler({ status: "draft", limit: 5 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/invoices?");
      expect(calledUrl).toContain("consumerId=con_test");
      expect(calledUrl).toContain("status=draft");
      expect(calledUrl).toContain("limit=5");

      expect(mockFetch.mock.calls[0][1]).toEqual({
        headers: {
          Authorization: "Bearer asc_test_key",
        },
      });

      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }],
      });

      vi.unstubAllGlobals();
    });
  });

  describe("no consumer", () => {
    it("returns error when consumer is null", async () => {
      setup(null);
      const handler = tools.get("asc_billing_list_events")!;
      const result = (await handler({})) as {
        content: Array<{ text: string }>;
        isError: boolean;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Consumer credentials required");
    });
  });
});
