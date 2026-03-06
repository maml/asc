// StripeAdapter — Traditional payment settlement via Stripe Connect transfers.
// Flow: create transfer to connected account → settlement complete.

import Stripe from "stripe";
import type {
  SettlementAdapter,
  SettlementRequest,
  SettlementResult,
  ProviderSettlementConfig,
} from "../../types/settlement.js";

export interface StripeAdapterConfig {
  secretKey: string;
}

export class StripeAdapter implements SettlementAdapter {
  private stripe: Stripe;

  constructor(config: StripeAdapterConfig) {
    this.stripe = new Stripe(config.secretKey);
  }

  async settle(request: SettlementRequest): Promise<SettlementResult> {
    const { providerConfig, providerAmountCents, currency, idempotencyKey } = request;

    if (!providerConfig.stripeConnectAccountId) {
      return { status: "failed", error: "No Stripe Connect account ID configured", retryable: false };
    }

    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount: providerAmountCents,
          currency: currency.toLowerCase(),
          destination: providerConfig.stripeConnectAccountId,
          metadata: { billingEventId: request.billingEventId },
        },
        { idempotencyKey },
      );

      return {
        status: "settled",
        externalId: transfer.id,
        externalStatus: "paid",
        networkFeeCents: 0,
      };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        // Rate limits and server errors are retryable
        const retryable = err.type === "StripeRateLimitError"
          || err.type === "StripeAPIError"
          || err.type === "StripeConnectionError";
        return { status: "failed", error: err.message, retryable };
      }
      return {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        retryable: true,
      };
    }
  }

  async checkStatus(externalId: string): Promise<SettlementResult> {
    try {
      const transfer = await this.stripe.transfers.retrieve(externalId);

      if (transfer.reversed) {
        return { status: "failed", externalId, externalStatus: "reversed", retryable: false };
      }

      return { status: "settled", externalId, externalStatus: "paid" };
    } catch (err) {
      return {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        retryable: true,
      };
    }
  }

  async validateConfig(config: ProviderSettlementConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.stripeConnectAccountId) {
      return { valid: false, error: "Stripe Connect account ID is required" };
    }
    if (!config.stripeConnectAccountId.startsWith("acct_")) {
      return { valid: false, error: "Invalid Stripe Connect account ID format (expected acct_...)" };
    }
    return { valid: true };
  }
}
