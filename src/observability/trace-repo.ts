// Trace repository — persistence for distributed traces and spans

import type pg from "pg";
import type { TraceId, SpanId, CoordinationId } from "../types/brand.js";
import type { Trace, Span, SpanStatus, SpanEvent } from "../types/trace.js";

// --- Row mappers ---

function rowToSpan(row: Record<string, unknown>): Span {
  return {
    spanId: row["id"] as SpanId,
    traceId: row["trace_id"] as TraceId,
    parentSpanId: row["parent_span_id"] ? (row["parent_span_id"] as SpanId) : undefined,
    operationName: row["operation_name"] as string,
    status: row["status"] as SpanStatus,
    startTime: (row["start_time"] as Date).toISOString(),
    endTime: row["end_time"] ? (row["end_time"] as Date).toISOString() : undefined,
    durationMs: row["duration_ms"] != null ? (row["duration_ms"] as number) : undefined,
    attributes: (row["attributes"] ?? {}) as Record<string, string>,
    events: ((row["events"] ?? []) as SpanEvent[]),
  };
}

function rowToTrace(row: Record<string, unknown>, spans: Span[]): Trace {
  return {
    traceId: row["id"] as TraceId,
    coordinationId: row["coordination_id"] as CoordinationId,
    rootSpanId: row["root_span_id"] as SpanId,
    spans,
    startTime: (row["start_time"] as Date).toISOString(),
    endTime: row["end_time"] ? (row["end_time"] as Date).toISOString() : undefined,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
  };
}

// --- Repository ---

export class TraceRepository {
  constructor(private pool: pg.Pool) {}

  async createTrace(coordinationId: string): Promise<{ traceId: string }> {
    const { rows } = await this.pool.query(
      `INSERT INTO traces (coordination_id)
       VALUES ($1)
       RETURNING id`,
      [coordinationId]
    );
    const row = rows[0] as Record<string, unknown>;
    return { traceId: row["id"] as string };
  }

  async createSpan(data: {
    traceId: string;
    parentSpanId?: string;
    operationName: string;
    attributes?: Record<string, unknown>;
  }): Promise<{ spanId: string }> {
    const { rows } = await this.pool.query(
      `INSERT INTO spans (trace_id, parent_span_id, operation_name, attributes)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        data.traceId,
        data.parentSpanId ?? null,
        data.operationName,
        JSON.stringify(data.attributes ?? {}),
      ]
    );
    const row = rows[0] as Record<string, unknown>;
    return { spanId: row["id"] as string };
  }

  async endSpan(spanId: string, status: SpanStatus, durationMs: number): Promise<void> {
    await this.pool.query(
      `UPDATE spans SET end_time = NOW(), status = $2, duration_ms = $3 WHERE id = $1`,
      [spanId, status, durationMs]
    );
  }

  async endTrace(traceId: string, rootSpanId: string): Promise<void> {
    await this.pool.query(
      `UPDATE traces SET end_time = NOW(), root_span_id = $2 WHERE id = $1`,
      [traceId, rootSpanId]
    );
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    const { rows: traceRows } = await this.pool.query(
      `SELECT * FROM traces WHERE id = $1`,
      [traceId]
    );
    if (traceRows.length === 0) return null;

    const { rows: spanRows } = await this.pool.query(
      `SELECT * FROM spans WHERE trace_id = $1 ORDER BY start_time ASC`,
      [traceId]
    );

    const spans = spanRows.map((r) => rowToSpan(r as Record<string, unknown>));
    return rowToTrace(traceRows[0] as Record<string, unknown>, spans);
  }

  async listTraces(opts: {
    limit?: number;
    offset?: string;
  }): Promise<{ traces: Trace[]; hasMore: boolean }> {
    const limit = opts.limit ?? 20;
    const params: unknown[] = [];
    const conditions: string[] = [];
    let idx = 1;

    if (opts.offset) {
      conditions.push(`t.id < $${idx++}`);
      params.push(opts.offset);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const { rows: traceRows } = await this.pool.query(
      `SELECT * FROM traces t ${where} ORDER BY t.start_time DESC, t.id DESC LIMIT $${idx}`,
      params
    );

    const hasMore = traceRows.length > limit;
    const traceSlice = hasMore ? traceRows.slice(0, limit) : traceRows;

    if (traceSlice.length === 0) {
      return { traces: [], hasMore: false };
    }

    // Batch-fetch all spans for the returned traces
    const traceIds = traceSlice.map((r) => (r as Record<string, unknown>)["id"]);
    const { rows: spanRows } = await this.pool.query(
      `SELECT * FROM spans WHERE trace_id = ANY($1) ORDER BY start_time ASC`,
      [traceIds]
    );

    // Group spans by trace_id
    const spansByTrace = new Map<string, Span[]>();
    for (const row of spanRows) {
      const r = row as Record<string, unknown>;
      const tid = r["trace_id"] as string;
      if (!spansByTrace.has(tid)) spansByTrace.set(tid, []);
      spansByTrace.get(tid)!.push(rowToSpan(r));
    }

    const traces = traceSlice.map((r) => {
      const row = r as Record<string, unknown>;
      const tid = row["id"] as string;
      return rowToTrace(row, spansByTrace.get(tid) ?? []);
    });

    return { traces, hasMore };
  }
}
