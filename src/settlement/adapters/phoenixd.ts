// PhoenixdAdapter — Lightning Network settlement via phoenixd HTTP API.
// Phoenixd operates in sats, so we convert from cents using a BTC/USD rate.
// Flow: convert amount → pay invoice or lightning address → settlement complete.

import type {
  SettlementAdapter,
  SettlementRequest,
  SettlementResult,
  ProviderSettlementConfig,
} from "../../types/settlement.js";

export interface PhoenixdConfig {
  /** Base URL for phoenixd HTTP API (default: http://localhost:9740) */
  baseUrl?: string;
  /** API password from ~/.phoenix/phoenix.conf */
  password: string;
  /** Fixed BTC/USD rate for conversions. If not set, adapter will fetch from external API. */
  fixedExchangeRate?: number;
}

interface PhoenixdPayResponse {
  recipientAmountSat: number;
  routingFeeSat: number;
  paymentId: string;
  paymentHash: string;
  paymentPreimage: string;
}

interface PhoenixdInvoiceResponse {
  amountSat: number;
  paymentHash: string;
  serialized: string;
}

export class PhoenixdAdapter implements SettlementAdapter {
  private baseUrl: string;
  private password: string;
  private fixedExchangeRate?: number;

  constructor(config: PhoenixdConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:9740";
    this.password = config.password;
    this.fixedExchangeRate = config.fixedExchangeRate;
  }

  async settle(request: SettlementRequest): Promise<SettlementResult> {
    const { providerConfig, providerAmountCents, idempotencyKey } = request;

    if (!providerConfig.lightningAddress) {
      return { status: "failed", error: "No lightning address configured", retryable: false };
    }

    try {
      // Convert USD cents to sats
      const rate = await this.getExchangeRate();
      const amountSat = Math.round((providerAmountCents / 100) / rate * 100_000_000);

      if (amountSat < 1) {
        return { status: "failed", error: "Amount too small to settle via Lightning", retryable: false };
      }

      const address = providerConfig.lightningAddress;

      // Lightning addresses (user@domain) get paid via LNURL, bolt11 invoices directly
      const isBolt11 = address.startsWith("lnbc") || address.startsWith("lntb");

      let result: PhoenixdPayResponse;
      if (isBolt11) {
        result = await this.payInvoice(address, amountSat);
      } else {
        result = await this.payLightningAddress(address, amountSat, `asc_${idempotencyKey}`);
      }

      return {
        status: "settled",
        externalId: result.paymentId,
        externalStatus: "completed",
        exchangeRate: rate,
        networkFeeCents: Math.ceil((result.routingFeeSat / 100_000_000) * rate * 100),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Network errors and server errors are retryable
      const retryable = !message.includes("not enough") && !message.includes("invalid");
      return { status: "failed", error: message, retryable };
    }
  }

  async checkStatus(externalId: string): Promise<SettlementResult> {
    // Phoenixd payments are synchronous — if settle() returned success, it's done.
    // For reconciliation, we check outgoing payments list.
    try {
      const res = await this.request("GET", "/payments/outgoing");
      const payments = res as Array<{ id: string; isPaid: boolean; fees: number }>;
      const payment = payments.find((p) => p.id === externalId);

      if (!payment) {
        return { status: "failed", externalId, error: "Payment not found", retryable: false };
      }

      if (payment.isPaid) {
        return { status: "settled", externalId, externalStatus: "completed" };
      }

      return { status: "failed", externalId, externalStatus: "pending", retryable: true };
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
    // Accept both lightning addresses (user@domain) and bolt11 invoices
    const addr = config.lightningAddress;
    const isLnAddress = addr.includes("@");
    const isBolt11 = addr.startsWith("lnbc") || addr.startsWith("lntb");

    if (!isLnAddress && !isBolt11) {
      return { valid: false, error: "Invalid format: expected user@domain or bolt11 invoice" };
    }
    return { valid: true };
  }

  /** Get BTC/USD exchange rate. Uses fixed rate if configured, otherwise fetches live. */
  private async getExchangeRate(): Promise<number> {
    if (this.fixedExchangeRate) return this.fixedExchangeRate;

    // Use a public, no-auth price API
    const res = await fetch("https://mempool.space/api/v1/prices");
    if (!res.ok) throw new Error(`Failed to fetch exchange rate: HTTP ${res.status}`);
    const data = (await res.json()) as { USD: number };
    return data.USD;
  }

  /** Pay a bolt11 invoice */
  private async payInvoice(invoice: string, amountSat?: number): Promise<PhoenixdPayResponse> {
    const body: Record<string, string> = { invoice };
    if (amountSat) body["amountSat"] = String(amountSat);
    return this.request("POST", "/payinvoice", body) as Promise<PhoenixdPayResponse>;
  }

  /** Pay a lightning address (user@domain) */
  private async payLightningAddress(
    address: string,
    amountSat: number,
    message?: string,
  ): Promise<PhoenixdPayResponse> {
    const body: Record<string, string> = {
      amountSat: String(amountSat),
      address,
    };
    if (message) body["message"] = message;
    return this.request("POST", "/paylnaddress", body) as Promise<PhoenixdPayResponse>;
  }

  /** Make an authenticated request to phoenixd */
  private async request(
    method: string,
    path: string,
    body?: Record<string, string>,
  ): Promise<unknown> {
    const auth = Buffer.from(`:${this.password}`).toString("base64");
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
    };

    const opts: RequestInit = { method, headers };

    if (body) {
      // Phoenixd uses form-encoded bodies, not JSON
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(body).toString();
    }

    const res = await fetch(`${this.baseUrl}${path}`, opts);

    if (!res.ok) {
      let errorMsg: string;
      try {
        const text = await res.text();
        errorMsg = text || `HTTP ${res.status}`;
      } catch {
        errorMsg = `HTTP ${res.status}`;
      }
      throw new Error(errorMsg);
    }

    return res.json();
  }
}
