// Branded types prevent mixing IDs across domains at compile time with zero runtime cost.
// Usage: const id = "abc" as ProviderId;

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
export type PipelineId = Brand<string, "PipelineId">;
export type PipelineExecutionId = Brand<string, "PipelineExecutionId">;
export type CryptoKeyId = Brand<string, "CryptoKeyId">;
