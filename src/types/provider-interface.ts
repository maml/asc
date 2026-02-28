// THE contract that agent providers must implement.
// 3 endpoints: POST /invoke, GET /health, POST /invoke/stream (optional)

import type { TaskId, AgentId, TraceId, SpanId } from "./brand.js";
import type { Timestamp, Metadata } from "./common.js";

/** Sent by ASC to the provider's POST /invoke endpoint */
export interface InvokeRequest {
  taskId: TaskId;
  agentId: AgentId;
  traceId: TraceId;
  spanId: SpanId;
  input: unknown;
  timeoutMs: number;
  metadata: Metadata;
}

export type InvokeStatus = "success" | "error" | "timeout";

/** Returned by the provider from POST /invoke */
export interface InvokeResponse {
  taskId: TaskId;
  status: InvokeStatus;
  output?: unknown;
  error?: string;
  durationMs: number;
  usage?: InvocationUsage;
}

/** Optional usage metrics for billing */
export interface InvocationUsage {
  inputTokens?: number;
  outputTokens?: number;
  computeMs?: number;
}

/** Returned by GET /health */
export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  agentId: AgentId;
  version: string;
  uptime: number; // seconds
  timestamp: Timestamp;
  checks?: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: "pass" | "fail";
  message?: string;
}

/** Discriminated union for server-sent events on POST /invoke/stream */
export type StreamEvent =
  | { type: "stream_start"; taskId: TaskId; timestamp: Timestamp }
  | { type: "stream_delta"; taskId: TaskId; delta: unknown; index: number }
  | { type: "stream_end"; taskId: TaskId; output: unknown; durationMs: number; usage?: InvocationUsage }
  | { type: "stream_error"; taskId: TaskId; error: string };
