import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SettlementRequest, ProviderSettlementConfig } from "../types/settlement.js";
import type { BillingEventId, ProviderId } from "../types/brand.js";

// --- Helpers ---

function makeConfig(overrides?: Partial<ProviderSettlementConfig>): ProviderSettlementConfig {
  return {
    providerId: "prov_1" as ProviderId,
    network: "stripe",
    stripeConnectAccountId: "acct_test123",
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

// vi.hoisted runs before vi.mock hoisting — safe to define shared refs here
const { mockCreate, mockRetrieve, MockStripeError } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockRetrieve = vi.fn();
  class MockStripeError extends Error {
    type: string;
    constructor(message: string, type: string) {
      super(message);
      this.type = type;
    }
  }
  return { mockCreate, mockRetrieve, MockStripeError };
});

vi.mock("stripe", () => {
  class StripeMock {
    transfers = { create: mockCreate, retrieve: mockRetrieve };
    constructor(_key: string) {}
    static errors = { StripeError: MockStripeError };
  }
  return { default: StripeMock };
});

// Import after mock setup
import { StripeAdapter } from "./adapters/stripe.js";

describe("StripeAdapter", () => {
  let adapter: StripeAdapter;

  beforeEach(() => {
    adapter = new StripeAdapter({ secretKey: "sk_test_123" });
    vi.clearAllMocks();
  });

  describe("settle", () => {
    it("creates transfer and returns settled with transfer ID", async () => {
      mockCreate.mockResolvedValueOnce({ id: "tr_abc123", object: "transfer" });

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("settled");
      expect(result.externalId).toBe("tr_abc123");
      expect(result.externalStatus).toBe("paid");
      expect(result.networkFeeCents).toBe(0);
    });

    it("fails when no stripeConnectAccountId", async () => {
      const req = makeRequest({
        providerConfig: makeConfig({ stripeConnectAccountId: undefined }),
      });
      const result = await adapter.settle(req);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("No Stripe Connect account ID");
      expect(result.retryable).toBe(false);
    });

    it("returns retryable on rate limit errors", async () => {
      mockCreate.mockRejectedValueOnce(new MockStripeError("Rate limit exceeded", "StripeRateLimitError"));

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
    });

    it("returns retryable on API/connection errors", async () => {
      mockCreate.mockRejectedValueOnce(new MockStripeError("Connection error", "StripeConnectionError"));

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
    });

    it("returns non-retryable on invalid account errors", async () => {
      mockCreate.mockRejectedValueOnce(new MockStripeError("No such connected account", "StripeInvalidRequestError"));

      const result = await adapter.settle(makeRequest());

      expect(result.status).toBe("failed");
      expect(result.error).toContain("No such connected account");
      expect(result.retryable).toBe(false);
    });

    it("passes correct params to Stripe", async () => {
      mockCreate.mockResolvedValueOnce({ id: "tr_params", object: "transfer" });

      await adapter.settle(makeRequest());

      expect(mockCreate).toHaveBeenCalledWith(
        {
          amount: 1000,
          currency: "usd",
          destination: "acct_test123",
          metadata: { billingEventId: "be_1" },
        },
        { idempotencyKey: "idem_1" },
      );
    });
  });

  describe("checkStatus", () => {
    it("returns settled for completed transfer", async () => {
      mockRetrieve.mockResolvedValueOnce({ id: "tr_ok", reversed: false });

      const result = await adapter.checkStatus("tr_ok");
      expect(result.status).toBe("settled");
      expect(result.externalId).toBe("tr_ok");
    });

    it("returns failed for reversed transfer", async () => {
      mockRetrieve.mockResolvedValueOnce({ id: "tr_rev", reversed: true });

      const result = await adapter.checkStatus("tr_rev");
      expect(result.status).toBe("failed");
      expect(result.externalStatus).toBe("reversed");
      expect(result.retryable).toBe(false);
    });

    it("returns retryable on fetch errors", async () => {
      mockRetrieve.mockRejectedValueOnce(new Error("Network error"));

      const result = await adapter.checkStatus("tr_err");
      expect(result.status).toBe("failed");
      expect(result.retryable).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("accepts valid acct_ format", async () => {
      const result = await adapter.validateConfig(makeConfig({ stripeConnectAccountId: "acct_abc123" }));
      expect(result.valid).toBe(true);
    });

    it("rejects missing account ID", async () => {
      const result = await adapter.validateConfig(makeConfig({ stripeConnectAccountId: undefined }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects invalid format", async () => {
      const result = await adapter.validateConfig(makeConfig({ stripeConnectAccountId: "not_valid" }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("acct_");
    });
  });
});
