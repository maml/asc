import type {
  CoordinationId,
  TaskId,
  AgentId,
  ConsumerId,
  TraceId,
} from "./brand.js";
import type { Timestamp, Metadata, OperationStatus } from "./common.js";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface CoordinationRequest {
  consumerId: ConsumerId;
  agentId: AgentId;
  input: unknown; // Validated at runtime via agent's inputSchema
  priority: TaskPriority;
  callbackUrl?: string;
  timeoutMs?: number;
  metadata?: Metadata;
}

export interface Task {
  id: TaskId;
  coordinationId: CoordinationId;
  agentId: AgentId;
  consumerId: ConsumerId;
  traceId: TraceId;
  status: OperationStatus;
  priority: TaskPriority;
  input: unknown;
  output?: unknown;
  error?: string;
  attemptCount: number;
  maxAttempts: number;
  timeoutMs: number;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  metadata: Metadata;
}

/** Discriminated union of all coordination lifecycle events */
export type CoordinationEventPayload =
  | { type: "task_created"; taskId: TaskId }
  | { type: "task_started"; taskId: TaskId; attemptNumber: number }
  | { type: "task_completed"; taskId: TaskId; output: unknown }
  | { type: "task_failed"; taskId: TaskId; error: string; willRetry: boolean }
  | { type: "task_timeout"; taskId: TaskId; elapsedMs: number }
  | { type: "task_cancelled"; taskId: TaskId; reason: string }
  | { type: "circuit_opened"; agentId: AgentId; failureCount: number }
  | { type: "circuit_closed"; agentId: AgentId }
  | { type: "sla_violation"; agentId: AgentId; metric: string; value: number };

export interface CoordinationEvent {
  coordinationId: CoordinationId;
  payload: CoordinationEventPayload;
  timestamp: Timestamp;
  traceId: TraceId;
}
