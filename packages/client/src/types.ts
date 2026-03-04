// SDK type definitions — mirrors the backend types for full type safety.
// These are kept in sync with ../../src/types/ but are self-contained
// so the SDK has zero dependency on the backend source.

// --- Brand types ---

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ProviderId = Brand<string, "ProviderId">;
export type AgentId = Brand<string, "AgentId">;
export type ConsumerId = Brand<string, "ConsumerId">;
export type CoordinationId = Brand<string, "CoordinationId">;
export type TaskId = Brand<string, "TaskId">;
export type TraceId = Brand<string, "TraceId">;
export type SpanId = Brand<string, "SpanId">;
export type SlaRuleId = Brand<string, "SlaRuleId">;
export type BillingEventId = Brand<string, "BillingEventId">;
export type QualityGateId = Brand<string, "QualityGateId">;
export type InvoiceId = Brand<string, "InvoiceId">;
export type CryptoKeyId = Brand<string, "CryptoKeyId">;

// --- Crypto Identity ---

export interface RegisteredKey {
  id: CryptoKeyId;
  entityType: "provider" | "consumer";
  entityId: string;
  publicKey: string;
  keyPath: KeyPathInfo | null;
  label: string;
  status: "active" | "revoked";
  createdAt: Timestamp;
  revokedAt: Timestamp | null;
}

export interface KeyPathInfo {
  purpose: number;
  orgIndex: number;
  scope: "provider-auth" | "consumer-auth" | "delegation";
  childIndex: number;
}

// --- Common ---

export type Timestamp = string;

export interface Money {
  amountCents: number;
  currency: string;
}

export interface PaginationRequest {
  cursor?: string;
  limit: number;
}

export interface PaginationResponse {
  nextCursor?: string;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export type Metadata = Record<string, string>;

export type OperationStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

// --- Provider ---

export type ProviderStatus = "pending_review" | "active" | "suspended" | "deactivated";

export interface ProviderOrg {
  id: ProviderId;
  name: string;
  description: string;
  contactEmail: string;
  webhookUrl: string;
  status: ProviderStatus;
  apiKeyHash: string;
  metadata: Metadata;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProviderRegistrationRequest {
  name: string;
  description: string;
  contactEmail: string;
  webhookUrl: string;
  metadata?: Metadata;
}

export interface ProviderRegistrationResponse {
  provider: ProviderOrg;
  apiKey: string;
}

// --- Consumer ---

export type ConsumerStatus = "active" | "suspended" | "deactivated";

export interface ConsumerOrg {
  id: ConsumerId;
  name: string;
  description: string;
  contactEmail: string;
  status: ConsumerStatus;
  apiKeyHash: string;
  rateLimitPerMinute: number;
  metadata: Metadata;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConsumerRegistrationRequest {
  name: string;
  description: string;
  contactEmail: string;
  metadata?: Metadata;
}

export interface ConsumerRegistrationResponse {
  consumer: ConsumerOrg;
  apiKey: string;
}

// --- Agent ---

export type AgentStatus = "draft" | "active" | "deprecated" | "disabled";

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export type PricingModel =
  | { type: "per_invocation"; pricePerCall: Money }
  | { type: "per_token"; inputPricePerToken: Money; outputPricePerToken: Money }
  | { type: "per_second"; pricePerSecond: Money }
  | { type: "flat_monthly"; monthlyPrice: Money };

export interface SlaCommitment {
  maxLatencyMs: number;
  uptimePercentage: number;
  maxErrorRate: number;
}

export interface Agent {
  id: AgentId;
  providerId: ProviderId;
  name: string;
  description: string;
  version: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  pricing: PricingModel;
  sla: SlaCommitment;
  supportsStreaming: boolean;
  metadata: Metadata;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AgentRegistrationRequest {
  name: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  pricing: PricingModel;
  sla: SlaCommitment;
  supportsStreaming: boolean;
  metadata?: Metadata;
}

// --- Coordination ---

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface CoordinationRequest {
  consumerId: ConsumerId;
  agentId: AgentId;
  input: unknown;
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

// --- Trace ---

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

// --- SLA ---

export type SlaMetricType = "latency" | "uptime" | "error_rate" | "throughput";

export interface SlaRule {
  id: SlaRuleId;
  agentId: AgentId;
  providerId: ProviderId;
  metricType: SlaMetricType;
  threshold: number;
  windowMinutes: number;
  createdAt: Timestamp;
}

export type ComplianceStatus = "compliant" | "warning" | "violated";

export interface SlaComplianceRecord {
  id: string;
  ruleId: SlaRuleId;
  agentId: AgentId;
  status: ComplianceStatus;
  currentValue: number;
  threshold: number;
  evaluatedAt: Timestamp;
  windowStart: Timestamp;
  windowEnd: Timestamp;
}

// --- Billing ---

export type BillingEventType = "invocation" | "streaming_session" | "adjustment" | "refund";

export interface PricingSnapshot {
  agentId: AgentId;
  pricing: PricingModel;
  capturedAt: Timestamp;
}

export interface BillingEvent {
  id: BillingEventId;
  taskId: TaskId;
  agentId: AgentId;
  providerId: ProviderId;
  consumerId: ConsumerId;
  type: BillingEventType;
  amount: Money;
  pricingSnapshot: PricingSnapshot;
  occurredAt: Timestamp;
  metadata: Record<string, string>;
}

export interface InvoiceSummary {
  id: InvoiceId;
  consumerId: ConsumerId;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  totalAmount: Money;
  lineItemCount: number;
  status: "draft" | "issued" | "paid" | "overdue";
  createdAt: Timestamp;
}

// --- Quality ---

export type QualityCheckConfig =
  | { type: "json_schema"; schema: Record<string, unknown> }
  | { type: "latency_threshold"; maxMs: number }
  | { type: "output_regex"; pattern: string; flags?: string }
  | { type: "custom_webhook"; url: string; timeoutMs: number };

export interface QualityGate {
  id: QualityGateId;
  agentId: AgentId;
  name: string;
  description: string;
  check: QualityCheckConfig;
  required: boolean;
  createdAt: Timestamp;
}

export type QualityCheckResult = "pass" | "fail" | "skip" | "error";

export interface QualityCheckRecord {
  gateId: QualityGateId;
  result: QualityCheckResult;
  message?: string;
  durationMs: number;
  checkedAt: Timestamp;
}

// --- Circuit Breaker ---

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxAttempts: number;
  windowMs: number;
}

export interface CircuitBreakerStatus {
  agentId: AgentId;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: Timestamp;
  lastStateChange: Timestamp;
  config: CircuitBreakerConfig;
}

// --- Pipeline ---

export type PipelineId = Brand<string, "PipelineId">;
export type PipelineExecutionId = Brand<string, "PipelineExecutionId">;

export type MappingOp =
  | { op: "pick"; fields: string[] }
  | { op: "merge"; value: Record<string, unknown> };

export type InputMapping = MappingOp[];

export interface PipelineStepDef {
  name: string;
  agentId: AgentId;
  inputMapping?: InputMapping;
  timeoutMs?: number;
  metadata?: Metadata;
}

export interface Pipeline {
  id: PipelineId;
  consumerId: ConsumerId;
  name: string;
  description: string;
  steps: PipelineStepDef[];
  priority: "low" | "normal" | "high" | "critical";
  metadata: Metadata;
  createdAt: Timestamp;
}

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
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  metadata: Metadata;
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
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
}
