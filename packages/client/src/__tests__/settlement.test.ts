import { describe, it, expect, beforeEach, vi } from "vitest";
import { AscProvider } from "../provider.js";
import { AscConsumer } from "../consumer.js";
import type { ProviderId, ConsumerId } from "../types.js";

const BASE_URL = "http://localhost:3100";
const API_KEY = "asc_test_key";
const PROVIDER_ID = "prov_123" as ProviderId;
const CONSUMER_ID = "con_123" as ConsumerId;

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(
      status === 204 ? null : JSON.stringify(body),
      { status, headers: { "Content-Type": "application/json" } },
    ),
  );
}

describe("AscProvider settlement methods", () => {
  let provider: AscProvider;

  beforeEach(() => {
    provider = new AscProvider({ baseUrl: BASE_URL, apiKey: API_KEY, providerId: PROVIDER_ID });
    vi.restoreAllMocks();
  });

  it("getSettlementConfig sends GET /api/providers/:id/settlement-config", async () => {
    const config = { providerId: PROVIDER_ID, network: "lightning", enabled: true };
    globalThis.fetch = mockFetch(200, { data: { config } });
    const result = await provider.getSettlementConfig();
    expect(result).toEqual(config);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(`/api/providers/${PROVIDER_ID}/settlement-config`);
  });

  it("updateSettlementConfig sends PUT /api/providers/:id/settlement-config", async () => {
    const config = { providerId: PROVIDER_ID, network: "lightning", enabled: true };
    globalThis.fetch = mockFetch(200, { data: { config } });
    const result = await provider.updateSettlementConfig({
      network: "lightning",
      lightningAddress: "user@strike.me",
      enabled: true,
    });
    expect(result).toEqual(config);
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("deleteSettlementConfig sends DELETE /api/providers/:id/settlement-config", async () => {
    globalThis.fetch = mockFetch(204, null);
    await provider.deleteSettlementConfig();
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });

  it("listSettlements sends GET /api/settlements with providerId", async () => {
    globalThis.fetch = mockFetch(200, { data: { settlements: [{ id: "stl_1" }] } });
    const result = await provider.listSettlements({ status: "settled" });
    expect(result).toEqual([{ id: "stl_1" }]);
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(`providerId=${PROVIDER_ID}`);
    expect(url).toContain("status=settled");
  });

  it("getSettlementSummary sends GET /api/settlements/summary with params", async () => {
    const summary = { totalGrossCents: 10000, settlementCount: 5 };
    globalThis.fetch = mockFetch(200, { data: { summary } });
    const result = await provider.getSettlementSummary({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
    expect(result).toEqual(summary);
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(`providerId=${PROVIDER_ID}`);
    expect(url).toContain("periodStart=2026-01-01");
    expect(url).toContain("periodEnd=2026-01-31");
  });
});

describe("AscConsumer settlement methods", () => {
  let consumer: AscConsumer;

  beforeEach(() => {
    consumer = new AscConsumer({ baseUrl: BASE_URL, apiKey: API_KEY, consumerId: CONSUMER_ID });
    vi.restoreAllMocks();
  });

  it("listSettlements sends GET /api/settlements with consumerId", async () => {
    globalThis.fetch = mockFetch(200, { data: { settlements: [{ id: "stl_2" }] } });
    const result = await consumer.listSettlements({ network: "lightning" });
    expect(result).toEqual([{ id: "stl_2" }]);
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(`consumerId=${CONSUMER_ID}`);
    expect(url).toContain("network=lightning");
  });
});
