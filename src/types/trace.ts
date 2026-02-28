import type { TraceId, SpanId, CoordinationId } from "./brand.js";
import type { Timestamp, Metadata } from "./common.js";

export type SpanStatus = "ok" | "error" | "timeout";

export interface Span {
  spanId: SpanId;
  traceId: TraceId;
  parentSpanId?: SpanId;
  operationName: string;
  status: SpanStatus;
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMs?: number;
  attributes: Metadata;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: Timestamp;
  attributes: Metadata;
}

export interface Trace {
  traceId: TraceId;
  coordinationId: CoordinationId;
  rootSpanId: SpanId;
  spans: Span[];
  startTime: Timestamp;
  endTime?: Timestamp;
  metadata: Metadata;
}
