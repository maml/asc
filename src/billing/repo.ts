// Billing repository — persistence for billing events and invoices

import type pg from "pg";
import type {
  BillingEventId,
  InvoiceId,
  AgentId,
  ProviderId,
  ConsumerId,
  TaskId,
} from "../types/brand.js";
import type {
  BillingEvent,
  BillingEventType,
  InvoiceSummary,
  PricingSnapshot,
} from "../types/billing.js";

// --- Row mappers ---

function rowToBillingEvent(row: Record<string, unknown>): BillingEvent {
  return {
    id: row["id"] as BillingEventId,
    taskId: row["task_id"] as TaskId,
    agentId: row["agent_id"] as AgentId,
    providerId: row["provider_id"] as ProviderId,
    consumerId: row["consumer_id"] as ConsumerId,
    type: row["event_type"] as BillingEventType,
    amount: {
      amountCents: row["amount_cents"] as number,
      currency: row["currency"] as string,
    },
    pricingSnapshot: row["pricing_snapshot"] as PricingSnapshot,
    occurredAt: (row["occurred_at"] as Date).toISOString(),
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
  };
}

function rowToInvoice(row: Record<string, unknown>): InvoiceSummary {
  return {
    id: row["id"] as InvoiceId,
    consumerId: row["consumer_id"] as ConsumerId,
    periodStart: (row["period_start"] as Date).toISOString(),
    periodEnd: (row["period_end"] as Date).toISOString(),
    totalAmount: {
      amountCents: row["total_amount_cents"] as number,
      currency: row["total_currency"] as string,
    },
    lineItemCount: row["line_item_count"] as number,
    status: row["status"] as InvoiceSummary["status"],
    createdAt: (row["created_at"] as Date).toISOString(),
  };
}

// --- Repository ---

export class BillingRepository {
  constructor(private pool: pg.Pool) {}

  async recordEvent(data: {
    taskId: string;
    agentId: string;
    providerId: string;
    consumerId: string;
    eventType: BillingEventType;
    amountCents: number;
    currency?: string;
    pricingSnapshot: PricingSnapshot;
    metadata?: Record<string, unknown>;
  }): Promise<BillingEvent> {
    const currency = data.currency ?? "USD";
    const { rows } = await this.pool.query(
      `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.taskId,
        data.agentId,
        data.providerId,
        data.consumerId,
        data.eventType,
        data.amountCents,
        currency,
        JSON.stringify(data.pricingSnapshot),
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return rowToBillingEvent(rows[0] as Record<string, unknown>);
  }

  async listEvents(opts: {
    consumerId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<BillingEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.consumerId) {
      conditions.push(`consumer_id = $${idx++}`);
      params.push(opts.consumerId);
    }
    if (opts.agentId) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(opts.agentId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM billing_events ${where} ORDER BY occurred_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToBillingEvent(r as Record<string, unknown>));
  }

  async getUsageSummary(opts: {
    consumerId?: string;
    agentId?: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<{
    totalCents: number;
    eventCount: number;
    byAgent: { agentId: string; totalCents: number; eventCount: number }[];
  }> {
    const conditions: string[] = [
      "occurred_at >= $1",
      "occurred_at <= $2",
    ];
    const params: unknown[] = [opts.periodStart, opts.periodEnd];
    let idx = 3;

    if (opts.consumerId) {
      conditions.push(`consumer_id = $${idx++}`);
      params.push(opts.consumerId);
    }
    if (opts.agentId) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(opts.agentId);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Totals
    const { rows: totalRows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents, COUNT(*)::int AS event_count
       FROM billing_events ${where}`,
      params
    );
    const totals = totalRows[0] as Record<string, unknown>;

    // Grouped by agent
    const { rows: agentRows } = await this.pool.query(
      `SELECT agent_id, SUM(amount_cents)::int AS total_cents, COUNT(*)::int AS event_count
       FROM billing_events ${where}
       GROUP BY agent_id
       ORDER BY total_cents DESC`,
      params
    );

    return {
      totalCents: totals["total_cents"] as number,
      eventCount: totals["event_count"] as number,
      byAgent: agentRows.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          agentId: row["agent_id"] as string,
          totalCents: row["total_cents"] as number,
          eventCount: row["event_count"] as number,
        };
      }),
    };
  }

  async createInvoice(data: {
    consumerId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<InvoiceSummary> {
    // Query billing events for this consumer+period to compute totals
    const { rows: summaryRows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents, COUNT(*)::int AS line_count
       FROM billing_events
       WHERE consumer_id = $1 AND occurred_at >= $2 AND occurred_at <= $3`,
      [data.consumerId, data.periodStart, data.periodEnd]
    );
    const summary = summaryRows[0] as Record<string, unknown>;

    const { rows } = await this.pool.query(
      `INSERT INTO invoices (consumer_id, period_start, period_end, total_amount_cents, total_currency, line_item_count, status)
       VALUES ($1, $2, $3, $4, 'USD', $5, 'draft')
       RETURNING *`,
      [
        data.consumerId,
        data.periodStart,
        data.periodEnd,
        summary["total_cents"] as number,
        summary["line_count"] as number,
      ]
    );
    return rowToInvoice(rows[0] as Record<string, unknown>);
  }

  async listInvoices(opts: {
    consumerId?: string;
    status?: string;
    limit?: number;
  }): Promise<InvoiceSummary[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.consumerId) {
      conditions.push(`consumer_id = $${idx++}`);
      params.push(opts.consumerId);
    }
    if (opts.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToInvoice(r as Record<string, unknown>));
  }

  async updateInvoiceStatus(id: string, status: string): Promise<void> {
    await this.pool.query("UPDATE invoices SET status = $1 WHERE id = $2", [status, id]);
  }

  async getMonthToDateSpend(): Promise<{ totalCents: number; currency: string }> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents
       FROM billing_events
       WHERE occurred_at >= date_trunc('month', now())`
    );
    const row = rows[0] as Record<string, unknown>;
    return {
      totalCents: row["total_cents"] as number,
      currency: "USD",
    };
  }
}
