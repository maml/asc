import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhoenixdAdapter } from "./adapters/phoenixd.js";
import type { SettlementRequest, ProviderSettlementConfig } from "../types/settlement.js";
import type { BillingEventId, ProviderId } from "../types/brand.js";

// --- Helpers ---

function makeConfig(overrides?: Partial<ProviderSettlementConfig>): ProviderSettlementConfig {
  return {
    providerId: "prov_1" as ProviderId,
    network: "lightning",
    lightningAddress: "test@getalby.com",
    enabled: true,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<SettlementRequest>): SettlementRequest {
  return {
    billingEventId: "be_1" as BillingEventId,
    providerAmountCents: 1000,
    currency: "USD",
    providerConfig: makeConfig(),
    idempotencyKey: "idem_1",
    ...overrides,
  };
}

describe("PhoenixdAdapter", () => {
  let adapter: PhoenixdAdapter;

  beforeEach(() => {
    adapter = new PhoenixdAdapter({
      password: "test-password",
      baseUrl: "http://localhost:9740",
      fixedExchangeRate: 100_000, // $100k per BTC for predictable tests
    });
    vi.restoreAllMocks();
  });

  describe("settle", () => {
    it("pays a lightning address and returns settled", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          recipientAmountSat: 1000,
          routingFeeSat: 2,
          paymentId: "pmt_abc123",
          paymentHash: "hash123",
          paymentPreimage: "preimage123",
        }), { status: 200 }),
      );

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("settled");
      expect(result.externalId).toBe("pmt_abc123");
      expect(result.exchangeRate).toBe(100_000);
      expect(result.networkFeeCents).toBeGreaterThanOrEqual(0);
    });

    it("pays a bolt11 invoice directly", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          recipientAmountSat: 1000,
          routingFeeSat: 1,
          paymentId: "pmt_bolt11",
          paymentHash: "hash456",
          paymentPreimage: "preimage456",
        }), { status: 200 }),
      );

      const req = makeRequest({
        providerConfig: makeConfig({ lightningAddress: "lnbc10u1p..." }),
      });
      const result = await adapter.settle(req);

      expect(result.status).toBe("settled");
      expect(result.externalId).toBe("pmt_bolt11");
    });

    it("fails when no lightning address configured", async () => {
      const req = makeRequest({
        providerConfig: makeConfig({ lightningAddress: undefined }),
      });
      const result = await adapter.settle(req);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("No lightning address");
      expect(result.retryable).toBe(false);
    });

    it("returns retryable on network errors", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.retryable).toBe(true);
    });

    it("returns retryable on server errors", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
    });

    it("returns non-retryable for insufficient funds", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("not enough balance", { status: 400 }),
      );

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(false);
    });

    it("converts cents to sats correctly", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          recipientAmountSat: 1000,
          routingFeeSat: 0,
          paymentId: "pmt_conv",
          paymentHash: "h",
          paymentPreimage: "p",
        }), { status: 200 }),
      );

      // $10.00 (1000 cents) at $100k/BTC = 10,000 sats
      await adapter.settle(makeRequest({ providerAmountCents: 1000 }));

      const call = fetchSpy.mock.calls[0]!;
      const body = call[1]!.body as string;
      expect(body).toContain("amountSat=10000");
    });

    it("uses form-encoded body and basic auth", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          recipientAmountSat: 1000,
          routingFeeSat: 0,
          paymentId: "pmt_auth",
          paymentHash: "h",
          paymentPreimage: "p",
        }), { status: 200 }),
      );

      await adapter.settle(makeRequest());

      const call = fetchSpy.mock.calls[0]!;
      const headers = call[1]!.headers as Record<string, string>;
      expect(headers["Authorization"]).toContain("Basic");
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });
  });

  describe("checkStatus", () => {
    it("returns settled when payment is paid", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([
          { id: "pmt_123", isPaid: true, fees: 2 },
        ]), { status: 200 }),
      );

      const result = await adapter.checkStatus("pmt_123");
      expect(result.status).toBe("settled");
      expect(result.externalId).toBe("pmt_123");
    });

    it("returns failed when payment not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const result = await adapter.checkStatus("pmt_missing");
      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(false);
    });

    it("returns retryable when payment not yet paid", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([
          { id: "pmt_pending", isPaid: false, fees: 0 },
        ]), { status: 200 }),
      );

      const result = await adapter.checkStatus("pmt_pending");
      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("accepts valid lightning address", async () => {
      const result = await adapter.validateConfig(makeConfig({ lightningAddress: "user@getalby.com" }));
      expect(result.valid).toBe(true);
    });

    it("accepts bolt11 invoice", async () => {
      const result = await adapter.validateConfig(makeConfig({ lightningAddress: "lnbc10u1p..." }));
      expect(result.valid).toBe(true);
    });

    it("rejects missing lightning address", async () => {
      const result = await adapter.validateConfig(makeConfig({ lightningAddress: undefined }));
      expect(result.valid).toBe(false);
    });

    it("rejects invalid format", async () => {
      const result = await adapter.validateConfig(makeConfig({ lightningAddress: "not-valid" }));
      expect(result.valid).toBe(false);
    });
  });

  describe("exchange rate", () => {
    it("fetches live rate when fixedExchangeRate not set", async () => {
      const liveAdapter = new PhoenixdAdapter({
        password: "test",
        baseUrl: "http://localhost:9740",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        // First call: exchange rate
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ USD: 95000 }), { status: 200 }),
        )
        // Second call: pay
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            recipientAmountSat: 1053,
            routingFeeSat: 1,
            paymentId: "pmt_live",
            paymentHash: "h",
            paymentPreimage: "p",
          }), { status: 200 }),
        );

      const result = await liveAdapter.settle(makeRequest());

      expect(result.status).toBe("settled");
      expect(result.exchangeRate).toBe(95000);
      // First fetch should be to mempool.space
      expect(fetchSpy.mock.calls[0]![0]).toContain("mempool.space");
    });
  });
});
