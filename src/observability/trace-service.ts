// Trace service — clean API for instrumenting coordination with distributed traces

import type { Trace } from "../types/trace.js";
import type { TraceRepository } from "./trace-repo.js";

export class TraceService {
  constructor(private repo: TraceRepository) {}

  /** Start a new trace for a coordination */
  async startTrace(coordinationId: string): Promise<{ traceId: string }> {
    return this.repo.createTrace(coordinationId);
  }

  /** Start a new span within a trace, returns spanId + wall-clock start for duration calc */
  async startSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string,
    attributes?: Record<string, unknown>
  ): Promise<{ spanId: string; startTime: number }> {
    const { spanId } = await this.repo.createSpan({
      traceId,
      parentSpanId,
      operationName,
      attributes,
    });
    return { spanId, startTime: Date.now() };
  }

  /** End a span — calculates duration from the startTime returned by startSpan */
  async endSpan(
    spanId: string,
    startTime: number,
    status: "ok" | "error" | "timeout"
  ): Promise<void> {
    const durationMs = Date.now() - startTime;
    await this.repo.endSpan(spanId, status, durationMs);
  }

  /** Mark a trace as complete with its root span */
  async completeTrace(traceId: string, rootSpanId: string): Promise<void> {
    await this.repo.endTrace(traceId, rootSpanId);
  }

  /** Get a single trace with all its spans */
  async getTrace(traceId: string): Promise<Trace | null> {
    return this.repo.getTrace(traceId);
  }

  /** List traces with cursor pagination */
  async listTraces(opts: {
    limit?: number;
    offset?: string;
  }): Promise<{ traces: Trace[]; hasMore: boolean }> {
    return this.repo.listTraces(opts);
  }
}
