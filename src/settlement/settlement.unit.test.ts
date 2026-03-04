import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettlementService } from "./service.js";
import { NoopAdapter } from "./adapters/noop.js";
import { StrikeAdapter } from "./adapters/strike.js";
import type { BillingEvent } from "../types/billing.js";
import type {
  SettlementAdapter,
  SettlementNetwork,
  Settlement,
  ProviderSettlementConfig,
} from "../types/settlement.js";
import type { BillingEventId, ProviderId, ConsumerId, AgentId, SettlementId } from "../types/brand.js";

// --- Helpers ---

function makeBillingEvent(overrides?: Partial<BillingEvent>): BillingEvent {
  return {
    id: "be_1" as BillingEventId,
    taskId: "task_1" as any,
    agentId: "agt_1" as AgentId,
    providerId: "prov_1" as ProviderId,
    consumerId: "con_1" as ConsumerId,
    type: "invocation",
    amount: { amountCents: 1000, currency: "USD" },
    pricingSnapshot: { agentId: "agt_1" as AgentId, pricing: { type: "per_invocation", pricePerCall: { amountCents: 1000, currency: "USD" } }, capturedAt: new Date().toISOString() },
    occurredAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeSettlement(overrides?: Partial<Settlement>): Settlement {
  return {
    id: "stl_1" as SettlementId,
    billingEventId: "be_1" as BillingEventId,
    providerId: "prov_1" as ProviderId,
    consumerId: "con_1" as ConsumerId,
    agentId: "agt_1" as AgentId,
    network: "noop",
    status: "pending",
    grossAmountCents: 1000,
    providerAmountCents: 950,
    platformFeeCents: 50,
    networkFeeCents: 0,
    currency: "USD",
    attemptCount: 0,
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProviderConfig(overrides?: Partial<ProviderSettlementConfig>): ProviderSettlementConfig {
  return {
    providerId: "prov_1" as ProviderId,
    network: "noop",
    enabled: true,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const mockRepo = {
  getByBillingEventId: vi.fn(),
  getProviderConfig: vi.fn(),
  createSettlement: vi.fn(),
  updateSettlement: vi.fn(),
  getById: vi.fn(),
  listPendingSettlements: vi.fn(),
  listSettlements: vi.fn(),
  getSettlementSummary: vi.fn(),
  upsertProviderConfig: vi.fn(),
  deleteProviderConfig: vi.fn(),
};

// --- Tests ---

describe("SettlementService", () => {
  let service: SettlementService;
  const adapters = new Map<SettlementNetwork, SettlementAdapter>();

  beforeEach(() => {
    vi.restoreAllMocks();
    adapters.clear();
    adapters.set("noop", new NoopAdapter());
    service = new SettlementService(
      mockRepo as any,
      adapters,
      { defaultFeePercentage: 0.02, minimumFeeCents: 1 },
    );
  });

  describe("calculateFee", () => {
    it("calculates 2% fee with floor", () => {
      const result = service.calculateFee(1000, "prov_1");
      expect(result).toEqual({ platformFeeCents: 20, providerAmountCents: 980 });
    });

    it("enforces minimum fee of 1 cent", () => {
      const result = service.calculateFee(1, "prov_1");
      expect(result).toEqual({ platformFeeCents: 1, providerAmountCents: 0 });
    });

    it("fee cannot exceed total amount", () => {
      // With 2% on 10 cents = 0.2 -> rounds to 0, floor kicks in to 1
      const result = service.calculateFee(10, "prov_1");
      expect(result.platformFeeCents).toBeLessThanOrEqual(10);
      expect(result.platformFeeCents + result.providerAmountCents).toBe(10);
    });

    it("uses provider override when configured", () => {
      const svc = new SettlementService(
        mockRepo as any,
        adapters,
        { defaultFeePercentage: 0.05, minimumFeeCents: 1, providerOverrides: { prov_1: 0.10 } },
      );
      const result = svc.calculateFee(1000, "prov_1");
      expect(result).toEqual({ platformFeeCents: 100, providerAmountCents: 900 });
    });
  });

  describe("settleBillingEvent", () => {
    it("returns existing settlement on duplicate billing event (idempotency)", async () => {
      const existing = makeSettlement();
      mockRepo.getByBillingEventId.mockResolvedValue(existing);

      const result = await service.settleBillingEvent(makeBillingEvent());
      expect(result).toBe(existing);
      expect(mockRepo.createSettlement).not.toHaveBeenCalled();
    });

    it("returns null when provider has no settlement config", async () => {
      mockRepo.getByBillingEventId.mockResolvedValue(null);
      mockRepo.getProviderConfig.mockResolvedValue(null);

      const result = await service.settleBillingEvent(makeBillingEvent());
      expect(result).toBeNull();
    });

    it("returns null when provider config is disabled", async () => {
      mockRepo.getByBillingEventId.mockResolvedValue(null);
      mockRepo.getProviderConfig.mockResolvedValue(makeProviderConfig({ enabled: false }));

      const result = await service.settleBillingEvent(makeBillingEvent());
      expect(result).toBeNull();
    });

    it("creates settlement and calls adapter on success", async () => {
      const settlement = makeSettlement();
      const settledSettlement = makeSettlement({ status: "settled" });

      mockRepo.getByBillingEventId.mockResolvedValue(null);
      mockRepo.getProviderConfig.mockResolvedValue(makeProviderConfig());
      mockRepo.createSettlement.mockResolvedValue(settlement);
      mockRepo.updateSettlement.mockResolvedValue(settledSettlement);
      mockRepo.getById.mockResolvedValue(settledSettlement);

      const result = await service.settleBillingEvent(makeBillingEvent());

      expect(mockRepo.createSettlement).toHaveBeenCalledOnce();
      expect(mockRepo.updateSettlement).toHaveBeenCalledOnce();
      expect(result).toEqual(settledSettlement);
    });

    it("marks settlement as failed when adapter throws", async () => {
      const settlement = makeSettlement();
      const failedSettlement = makeSettlement({ status: "failed" });

      const failingAdapter: SettlementAdapter = {
        settle: vi.fn().mockRejectedValue(new Error("Network down")),
        checkStatus: vi.fn(),
        validateConfig: vi.fn(),
      };
      adapters.set("noop", failingAdapter);

      mockRepo.getByBillingEventId.mockResolvedValue(null);
      mockRepo.getProviderConfig.mockResolvedValue(makeProviderConfig());
      mockRepo.createSettlement.mockResolvedValue(settlement);
      mockRepo.updateSettlement.mockResolvedValue(failedSettlement);
      mockRepo.getById.mockResolvedValue(failedSettlement);

      const result = await service.settleBillingEvent(makeBillingEvent());
      expect(result!.status).toBe("failed");
    });

    it("marks settlement failed when no adapter exists for network", async () => {
      const settlement = makeSettlement();
      const failedSettlement = makeSettlement({ status: "failed" });

      mockRepo.getByBillingEventId.mockResolvedValue(null);
      mockRepo.getProviderConfig.mockResolvedValue(makeProviderConfig({ network: "lightning" }));
      mockRepo.createSettlement.mockResolvedValue(settlement);
      mockRepo.updateSettlement.mockResolvedValue(failedSettlement);
      mockRepo.getById.mockResolvedValue(failedSettlement);

      // No lightning adapter registered
      const result = await service.settleBillingEvent(makeBillingEvent());
      expect(mockRepo.updateSettlement).toHaveBeenCalledWith(settlement.id, expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("No adapter"),
      }));
    });
  });
});

describe("NoopAdapter", () => {
  const adapter = new NoopAdapter();

  it("settle returns settled status with noop external ID", async () => {
    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig(),
      idempotencyKey: "stl_1",
    });
    expect(result.status).toBe("settled");
    expect(result.externalId).toBe("noop_be_1");
    expect(result.networkFeeCents).toBe(0);
  });

  it("checkStatus returns settled", async () => {
    const result = await adapter.checkStatus("noop_be_1");
    expect(result.status).toBe("settled");
  });

  it("validateConfig always returns valid", async () => {
    const result = await adapter.validateConfig(makeProviderConfig());
    expect(result.valid).toBe(true);
  });
});

describe("StrikeAdapter", () => {
  const adapter = new StrikeAdapter({ apiKey: "test_strike_key", baseUrl: "https://api.test.strike.me" });

  it("settle calls Strike API and returns settled", async () => {
    const mockFetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paymentQuoteId: "quote_1",
          conversionRate: { amount: "0.000015", sourceCurrency: "USD", targetCurrency: "BTC" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          paymentId: "pay_1",
          state: "COMPLETED",
        }),
      });
    vi.stubGlobal("fetch", mockFetchFn);

    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig({ network: "lightning", lightningAddress: "user@strike.me" }),
      idempotencyKey: "stl_1",
    });

    expect(result.status).toBe("settled");
    expect(result.externalId).toBe("pay_1");
    expect(mockFetchFn).toHaveBeenCalledTimes(2);

    // Verify quote request
    const quoteCall = mockFetchFn.mock.calls[0];
    expect(quoteCall[0]).toBe("https://api.test.strike.me/v1/payment-quotes/lightning");
    expect(JSON.parse(quoteCall[1].body)).toEqual({
      lnAddressOrInvoice: "user@strike.me",
      sourceCurrency: "USD",
      sourceAmount: { amount: "9.50", currency: "USD" },
    });

    vi.unstubAllGlobals();
  });

  it("returns failed with retryable=false on 400", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad request" }),
    }));

    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig({ network: "lightning", lightningAddress: "user@strike.me" }),
      idempotencyKey: "stl_1",
    });

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns failed with retryable=true on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: "Internal error" }),
    }));

    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig({ network: "lightning", lightningAddress: "user@strike.me" }),
      idempotencyKey: "stl_1",
    });

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns failed when no lightning address configured", async () => {
    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig({ network: "lightning" }),
      idempotencyKey: "stl_1",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No lightning address");
  });

  it("validateConfig requires lightning address with @ format", async () => {
    expect(await adapter.validateConfig(makeProviderConfig())).toEqual({
      valid: false,
      error: "Lightning address is required",
    });
    expect(await adapter.validateConfig(makeProviderConfig({ lightningAddress: "nope" }))).toEqual({
      valid: false,
      error: expect.stringContaining("Invalid lightning address"),
    });
    expect(await adapter.validateConfig(makeProviderConfig({ lightningAddress: "user@strike.me" }))).toEqual({
      valid: true,
    });
  });

  it("returns retryable=true on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const result = await adapter.settle({
      billingEventId: "be_1" as BillingEventId,
      providerAmountCents: 950,
      currency: "USD",
      providerConfig: makeProviderConfig({ network: "lightning", lightningAddress: "user@strike.me" }),
      idempotencyKey: "stl_1",
    });

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.error).toContain("Connection refused");
    vi.unstubAllGlobals();
  });
});
