// Pipeline types — declarative multi-agent chaining

import type { PipelineId, PipelineExecutionId, AgentId, ConsumerId, TraceId, CoordinationId, TaskId } from "./brand.js";

// --- Input Mapping ---

export type MappingOp =
  | { op: "pick"; fields: string[] }
  | { op: "merge"; value: Record<string, unknown> };

export type InputMapping = MappingOp[];

// --- Pipeline Definition ---

export interface PipelineStepDef {
  name: string;
  agentId: AgentId;
  inputMapping?: InputMapping;
  timeoutMs?: number;
  metadata?: Record<string, string>;
}

export interface Pipeline {
  id: PipelineId;
  consumerId: ConsumerId;
  name: string;
  description: string;
  steps: PipelineStepDef[];
  priority: "low" | "normal" | "high" | "critical";
  metadata: Record<string, string>;
  createdAt: string;
}

// --- Execution ---

export type PipelineExecutionStatus = "pending" | "running" | "completed" | "failed";
export type PipelineStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PipelineExecution {
  id: PipelineExecutionId;
  pipelineId: PipelineId;
  consumerId: ConsumerId;
  traceId: TraceId;
  status: PipelineExecutionStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  failedStepIndex?: number;
  currentStepIndex: number;
  totalSteps: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, string>;
}

export interface PipelineStepExecution {
  executionId: PipelineExecutionId;
  stepIndex: number;
  stepName: string;
  agentId: AgentId;
  coordinationId?: CoordinationId;
  taskId?: TaskId;
  status: PipelineStepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// --- Events ---

export type PipelineEventPayload =
  | { type: "pipeline_started"; executionId: PipelineExecutionId }
  | { type: "pipeline_step_started"; executionId: PipelineExecutionId; stepIndex: number; stepName: string; agentId: AgentId }
  | { type: "pipeline_step_completed"; executionId: PipelineExecutionId; stepIndex: number; stepName: string; output: unknown }
  | { type: "pipeline_step_failed"; executionId: PipelineExecutionId; stepIndex: number; stepName: string; error: string }
  | { type: "pipeline_completed"; executionId: PipelineExecutionId; output: unknown }
  | { type: "pipeline_failed"; executionId: PipelineExecutionId; error: string; failedStepIndex: number };

export interface PipelineEvent {
  executionId: PipelineExecutionId;
  traceId: TraceId;
  payload: PipelineEventPayload;
  timestamp: string;
}
