// StrikeAdapter — Lightning Network settlement via Strike REST API.
// Flow: create quote → execute quote → settlement complete.

import type {
  SettlementAdapter,
  SettlementRequest,
  SettlementResult,
  ProviderSettlementConfig,
} from "../../types/settlement.js";

export interface StrikeConfig {
  apiKey: string;
  baseUrl?: string;
}

interface StrikeQuoteResponse {
  paymentQuoteId: string;
  conversionRate?: { amount: string; sourceCurrency: string; targetCurrency: string };
}

interface StrikeExecuteResponse {
  paymentId: string;
  state: string;
  totalAmount?: { amount: string; currency: string };
}

export class StrikeAdapter implements SettlementAdapter {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: StrikeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.strike.me";
  }

  async settle(request: SettlementRequest): Promise<SettlementResult> {
    const { providerConfig, providerAmountCents, currency, idempotencyKey } = request;

    if (!providerConfig.lightningAddress) {
      return { status: "failed", error: "No lightning address configured", retryable: false };
    }

    // Convert cents to dollars for Strike API
    const amountStr = (providerAmountCents / 100).toFixed(2);

    try {
      // Step 1: Create payment quote
      const quoteRes = await fetch(`${this.baseUrl}/v1/payment-quotes/lightning`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Idempotency-Key": `quote_${idempotencyKey}`,
        },
        body: JSON.stringify({
          lnAddressOrInvoice: providerConfig.lightningAddress,
          sourceCurrency: currency,
          sourceAmount: { amount: amountStr, currency },
        }),
      });

      if (!quoteRes.ok) {
        return this.handleError(quoteRes);
      }

      const quote = (await quoteRes.json()) as StrikeQuoteResponse;

      // Step 2: Execute the payment
      const executeRes = await fetch(
        `${this.baseUrl}/v1/payment-quotes/${quote.paymentQuoteId}/execute`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Idempotency-Key": `exec_${idempotencyKey}`,
          },
        }
      );

      if (!executeRes.ok) {
        return this.handleError(executeRes);
      }

      const payment = (await executeRes.json()) as StrikeExecuteResponse;

      return {
        status: "settled",
        externalId: payment.paymentId,
        externalStatus: payment.state,
        exchangeRate: quote.conversionRate
          ? Number(quote.conversionRate.amount)
          : undefined,
        networkFeeCents: 0,
      };
    } catch (err) {
      // Network errors are retryable
      return {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        retryable: true,
      };
    }
  }

  async checkStatus(externalId: string): Promise<SettlementResult> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/payments/${externalId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        return this.handleError(res);
      }

      const payment = (await res.json()) as { state: string };

      if (payment.state === "COMPLETED") {
        return { status: "settled", externalId, externalStatus: payment.state };
      }

      return { status: "failed", externalId, externalStatus: payment.state, retryable: true };
    } catch (err) {
      return {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        retryable: true,
      };
    }
  }

  async validateConfig(config: ProviderSettlementConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.lightningAddress) {
      return { valid: false, error: "Lightning address is required" };
    }
    // Basic format check: user@domain
    if (!config.lightningAddress.includes("@")) {
      return { valid: false, error: "Invalid lightning address format (expected user@domain)" };
    }
    return { valid: true };
  }

  private async handleError(res: Response): Promise<SettlementResult> {
    const status = res.status;
    let errorMsg: string;
    try {
      const body = (await res.json()) as { message?: string; data?: { message?: string } };
      errorMsg = body.data?.message ?? body.message ?? `HTTP ${status}`;
    } catch {
      errorMsg = `HTTP ${status}`;
    }

    // 429 rate limit and 5xx are retryable
    const retryable = status === 429 || status >= 500;

    return { status: "failed", error: errorMsg, retryable };
  }
}
