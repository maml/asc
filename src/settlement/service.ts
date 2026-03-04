// Settlement service — orchestrates settlement after billing events

import type { BillingEvent } from "../types/billing.js";
import type {
  Settlement,
  SettlementAdapter,
  SettlementNetwork,
  ProviderSettlementConfig,
  PlatformFeeConfig,
  SettlementSummary,
} from "../types/settlement.js";
import type { SettlementRepository } from "./repository.js";

export class SettlementService {
  constructor(
    private repo: SettlementRepository,
    private adapters: Map<SettlementNetwork, SettlementAdapter>,
    private feeConfig: PlatformFeeConfig,
  ) {}

  /** Settle a billing event — idempotent, fire-and-forget safe */
  async settleBillingEvent(billingEvent: BillingEvent): Promise<Settlement | null> {
    // Idempotency: already settled?
    const existing = await this.repo.getByBillingEventId(billingEvent.id);
    if (existing) return existing;

    // Look up provider's settlement config
    const config = await this.repo.getProviderConfig(billingEvent.providerId);
    if (!config || !config.enabled) return null;

    // Calculate fees
    const { platformFeeCents, providerAmountCents } = this.calculateFee(
      billingEvent.amount.amountCents,
      billingEvent.providerId,
    );

    // Create settlement row (pending)
    const settlement = await this.repo.createSettlement({
      billingEventId: billingEvent.id,
      providerId: billingEvent.providerId,
      consumerId: billingEvent.consumerId,
      agentId: billingEvent.agentId,
      network: config.network,
      grossAmountCents: billingEvent.amount.amountCents,
      providerAmountCents,
      platformFeeCents,
      currency: billingEvent.amount.currency,
    });

    // Get the adapter
    const adapter = this.adapters.get(config.network);
    if (!adapter) {
      await this.repo.updateSettlement(settlement.id, {
        status: "failed",
        error: `No adapter for network: ${config.network}`,
        attemptCount: 1,
        lastAttemptAt: new Date().toISOString(),
      });
      return this.repo.getById(settlement.id) as Promise<Settlement>;
    }

    // Attempt settlement
    try {
      const result = await adapter.settle({
        billingEventId: billingEvent.id,
        providerAmountCents,
        currency: billingEvent.amount.currency,
        providerConfig: config,
        idempotencyKey: settlement.id,
      });

      await this.repo.updateSettlement(settlement.id, {
        status: result.status,
        externalId: result.externalId,
        externalStatus: result.externalStatus,
        networkFeeCents: result.networkFeeCents ?? 0,
        exchangeRate: result.exchangeRate,
        error: result.error,
        attemptCount: 1,
        lastAttemptAt: new Date().toISOString(),
        settledAt: result.status === "settled" ? new Date().toISOString() : undefined,
      });
    } catch (err) {
      await this.repo.updateSettlement(settlement.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        attemptCount: 1,
        lastAttemptAt: new Date().toISOString(),
      });
    }

    return this.repo.getById(settlement.id) as Promise<Settlement>;
  }

  /** Calculate platform fee split */
  calculateFee(
    amountCents: number,
    providerId: string,
  ): { platformFeeCents: number; providerAmountCents: number } {
    const rate = this.feeConfig.providerOverrides?.[providerId] ?? this.feeConfig.defaultFeePercentage;
    let platformFeeCents = Math.round(amountCents * rate);
    platformFeeCents = Math.max(platformFeeCents, this.feeConfig.minimumFeeCents);
    // Fee can't exceed the total amount
    platformFeeCents = Math.min(platformFeeCents, amountCents);
    const providerAmountCents = amountCents - platformFeeCents;
    return { platformFeeCents, providerAmountCents };
  }

  /** Retry failed/pending settlements */
  async reconcilePending(): Promise<{ attempted: number; settled: number; failed: number }> {
    const pending = await this.repo.listPendingSettlements(50);
    let settled = 0;
    let failed = 0;

    for (const settlement of pending) {
      const config = await this.repo.getProviderConfig(settlement.providerId);
      if (!config || !config.enabled) continue;

      const adapter = this.adapters.get(settlement.network);
      if (!adapter) continue;

      try {
        // If we have an external ID, check status first
        if (settlement.externalId) {
          const status = await adapter.checkStatus(settlement.externalId);
          if (status.status === "settled") {
            await this.repo.updateSettlement(settlement.id, {
              status: "settled",
              externalStatus: status.externalStatus,
              settledAt: new Date().toISOString(),
              attemptCount: settlement.attemptCount + 1,
              lastAttemptAt: new Date().toISOString(),
            });
            settled++;
            continue;
          }
        }

        // Retry settlement
        const result = await adapter.settle({
          billingEventId: settlement.billingEventId,
          providerAmountCents: settlement.providerAmountCents,
          currency: settlement.currency,
          providerConfig: config,
          idempotencyKey: settlement.id,
        });

        await this.repo.updateSettlement(settlement.id, {
          status: result.status,
          externalId: result.externalId,
          externalStatus: result.externalStatus,
          error: result.error,
          attemptCount: settlement.attemptCount + 1,
          lastAttemptAt: new Date().toISOString(),
          settledAt: result.status === "settled" ? new Date().toISOString() : undefined,
        });

        if (result.status === "settled") settled++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { attempted: pending.length, settled, failed };
  }

  // --- Provider config CRUD ---

  async getProviderConfig(providerId: string): Promise<ProviderSettlementConfig | null> {
    return this.repo.getProviderConfig(providerId);
  }

  async upsertProviderConfig(data: {
    providerId: string;
    network: SettlementNetwork;
    lightningAddress?: string;
    liquidAddress?: string;
    stripeConnectAccountId?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderSettlementConfig> {
    return this.repo.upsertProviderConfig(data);
  }

  async deleteProviderConfig(providerId: string): Promise<void> {
    return this.repo.deleteProviderConfig(providerId);
  }

  // --- Query ---

  async getSettlement(id: string): Promise<Settlement | null> {
    return this.repo.getById(id);
  }

  async listSettlements(opts: {
    providerId?: string;
    consumerId?: string;
    status?: string;
    network?: string;
    limit?: number;
  }): Promise<Settlement[]> {
    return this.repo.listSettlements(opts);
  }

  async getSettlementSummary(opts: {
    providerId?: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SettlementSummary> {
    return this.repo.getSettlementSummary(opts);
  }
}
