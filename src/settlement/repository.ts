// Settlement repository — persistence for settlements and provider settlement configs

import type pg from "pg";
import type {
  SettlementId,
  BillingEventId,
  ProviderId,
  ConsumerId,
  AgentId,
} from "../types/brand.js";
import type {
  Settlement,
  SettlementStatus,
  SettlementNetwork,
  ProviderSettlementConfig,
  SettlementSummary,
} from "../types/settlement.js";

// --- Row mappers ---

function rowToSettlement(row: Record<string, unknown>): Settlement {
  return {
    id: row["id"] as SettlementId,
    billingEventId: row["billing_event_id"] as BillingEventId,
    providerId: row["provider_id"] as ProviderId,
    consumerId: row["consumer_id"] as ConsumerId,
    agentId: row["agent_id"] as AgentId,
    network: row["network"] as SettlementNetwork,
    status: row["status"] as SettlementStatus,
    grossAmountCents: Number(row["gross_amount_cents"]),
    providerAmountCents: Number(row["provider_amount_cents"]),
    platformFeeCents: Number(row["platform_fee_cents"]),
    networkFeeCents: Number(row["network_fee_cents"]),
    currency: row["currency"] as string,
    exchangeRate: row["exchange_rate"] != null ? Number(row["exchange_rate"]) : undefined,
    externalId: row["external_id"] as string | undefined,
    externalStatus: row["external_status"] as string | undefined,
    attemptCount: row["attempt_count"] as number,
    lastAttemptAt: row["last_attempt_at"] ? (row["last_attempt_at"] as Date).toISOString() : undefined,
    settledAt: row["settled_at"] ? (row["settled_at"] as Date).toISOString() : undefined,
    error: row["error"] as string | undefined,
    metadata: (row["metadata"] ?? {}) as Record<string, unknown>,
    createdAt: (row["created_at"] as Date).toISOString(),
  };
}

function rowToProviderConfig(row: Record<string, unknown>): ProviderSettlementConfig {
  return {
    providerId: row["provider_id"] as ProviderId,
    network: row["network"] as SettlementNetwork,
    lightningAddress: row["lightning_address"] as string | undefined,
    liquidAddress: row["liquid_address"] as string | undefined,
    stripeConnectAccountId: row["stripe_connect_account_id"] as string | undefined,
    enabled: row["enabled"] as boolean,
    metadata: (row["metadata"] ?? {}) as Record<string, unknown>,
    createdAt: (row["created_at"] as Date).toISOString(),
    updatedAt: (row["updated_at"] as Date).toISOString(),
  };
}

// --- Repository ---

export class SettlementRepository {
  constructor(private pool: pg.Pool) {}

  async createSettlement(data: {
    billingEventId: string;
    providerId: string;
    consumerId: string;
    agentId: string;
    network: SettlementNetwork;
    grossAmountCents: number;
    providerAmountCents: number;
    platformFeeCents: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Settlement> {
    const { rows } = await this.pool.query(
      `INSERT INTO settlements (billing_event_id, provider_id, consumer_id, agent_id, network, gross_amount_cents, provider_amount_cents, platform_fee_cents, currency, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.billingEventId,
        data.providerId,
        data.consumerId,
        data.agentId,
        data.network,
        data.grossAmountCents,
        data.providerAmountCents,
        data.platformFeeCents,
        data.currency ?? "USD",
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return rowToSettlement(rows[0] as Record<string, unknown>);
  }

  async updateSettlement(
    id: string,
    fields: Partial<{
      status: SettlementStatus;
      externalId: string;
      externalStatus: string;
      networkFeeCents: number;
      exchangeRate: number;
      settledAt: string;
      error: string;
      attemptCount: number;
      lastAttemptAt: string;
    }>
  ): Promise<Settlement> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (fields.status !== undefined) { sets.push(`status = $${idx++}`); params.push(fields.status); }
    if (fields.externalId !== undefined) { sets.push(`external_id = $${idx++}`); params.push(fields.externalId); }
    if (fields.externalStatus !== undefined) { sets.push(`external_status = $${idx++}`); params.push(fields.externalStatus); }
    if (fields.networkFeeCents !== undefined) { sets.push(`network_fee_cents = $${idx++}`); params.push(fields.networkFeeCents); }
    if (fields.exchangeRate !== undefined) { sets.push(`exchange_rate = $${idx++}`); params.push(fields.exchangeRate); }
    if (fields.settledAt !== undefined) { sets.push(`settled_at = $${idx++}`); params.push(fields.settledAt); }
    if (fields.error !== undefined) { sets.push(`error = $${idx++}`); params.push(fields.error); }
    if (fields.attemptCount !== undefined) { sets.push(`attempt_count = $${idx++}`); params.push(fields.attemptCount); }
    if (fields.lastAttemptAt !== undefined) { sets.push(`last_attempt_at = $${idx++}`); params.push(fields.lastAttemptAt); }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE settlements SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rowToSettlement(rows[0] as Record<string, unknown>);
  }

  async getByBillingEventId(billingEventId: string): Promise<Settlement | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM settlements WHERE billing_event_id = $1",
      [billingEventId]
    );
    return rows.length > 0 ? rowToSettlement(rows[0] as Record<string, unknown>) : null;
  }

  async getById(id: string): Promise<Settlement | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM settlements WHERE id = $1",
      [id]
    );
    return rows.length > 0 ? rowToSettlement(rows[0] as Record<string, unknown>) : null;
  }

  async listSettlements(opts: {
    providerId?: string;
    consumerId?: string;
    status?: string;
    network?: string;
    limit?: number;
  }): Promise<Settlement[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.providerId) { conditions.push(`provider_id = $${idx++}`); params.push(opts.providerId); }
    if (opts.consumerId) { conditions.push(`consumer_id = $${idx++}`); params.push(opts.consumerId); }
    if (opts.status) { conditions.push(`status = $${idx++}`); params.push(opts.status); }
    if (opts.network) { conditions.push(`network = $${idx++}`); params.push(opts.network); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM settlements ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );
    return rows.map((r) => rowToSettlement(r as Record<string, unknown>));
  }

  async getSettlementSummary(opts: {
    providerId?: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SettlementSummary> {
    const conditions: string[] = ["created_at >= $1", "created_at <= $2"];
    const params: unknown[] = [opts.periodStart, opts.periodEnd];
    let idx = 3;

    if (opts.providerId) {
      conditions.push(`provider_id = $${idx++}`);
      params.push(opts.providerId);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const { rows: totalRows } = await this.pool.query(
      `SELECT
        COALESCE(SUM(gross_amount_cents), 0)::int AS total_gross,
        COALESCE(SUM(provider_amount_cents), 0)::int AS total_provider,
        COALESCE(SUM(platform_fee_cents), 0)::int AS total_platform_fee,
        COALESCE(SUM(network_fee_cents), 0)::int AS total_network_fee,
        COUNT(*)::int AS settlement_count
       FROM settlements ${where}`,
      params
    );
    const totals = totalRows[0] as Record<string, unknown>;

    const { rows: networkRows } = await this.pool.query(
      `SELECT network, COUNT(*)::int AS count, COALESCE(SUM(gross_amount_cents), 0)::int AS total_cents
       FROM settlements ${where}
       GROUP BY network`,
      params
    );

    const byNetwork: Record<string, { count: number; totalCents: number }> = {};
    for (const r of networkRows) {
      const row = r as Record<string, unknown>;
      byNetwork[row["network"] as string] = {
        count: row["count"] as number,
        totalCents: row["total_cents"] as number,
      };
    }

    return {
      totalGrossCents: totals["total_gross"] as number,
      totalProviderCents: totals["total_provider"] as number,
      totalPlatformFeeCents: totals["total_platform_fee"] as number,
      totalNetworkFeeCents: totals["total_network_fee"] as number,
      settlementCount: totals["settlement_count"] as number,
      byNetwork,
    };
  }

  async listPendingSettlements(limit?: number): Promise<Settlement[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM settlements WHERE status IN ('pending', 'failed')
       ORDER BY created_at ASC LIMIT $1`,
      [limit ?? 100]
    );
    return rows.map((r) => rowToSettlement(r as Record<string, unknown>));
  }

  // --- Provider config ---

  async getProviderConfig(providerId: string): Promise<ProviderSettlementConfig | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM provider_settlement_configs WHERE provider_id = $1",
      [providerId]
    );
    return rows.length > 0 ? rowToProviderConfig(rows[0] as Record<string, unknown>) : null;
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
    const { rows } = await this.pool.query(
      `INSERT INTO provider_settlement_configs (provider_id, network, lightning_address, liquid_address, stripe_connect_account_id, enabled, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_id)
       DO UPDATE SET network = $2, lightning_address = $3, liquid_address = $4, stripe_connect_account_id = $5, enabled = $6, metadata = $7, updated_at = now()
       RETURNING *`,
      [
        data.providerId,
        data.network,
        data.lightningAddress ?? null,
        data.liquidAddress ?? null,
        data.stripeConnectAccountId ?? null,
        data.enabled ?? false,
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return rowToProviderConfig(rows[0] as Record<string, unknown>);
  }

  async deleteProviderConfig(providerId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM provider_settlement_configs WHERE provider_id = $1",
      [providerId]
    );
  }
}
