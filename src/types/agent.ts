import type { AgentId, ProviderId } from "./brand.js";
import type { Timestamp, Money, Metadata } from "./common.js";

export type AgentStatus = "draft" | "active" | "deprecated" | "disabled";

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
  outputSchema: Record<string, unknown>; // JSON Schema
}

export type PricingModel =
  | { type: "per_invocation"; pricePerCall: Money }
  | { type: "per_token"; inputPricePerToken: Money; outputPricePerToken: Money }
  | { type: "per_second"; pricePerSecond: Money }
  | { type: "flat_monthly"; monthlyPrice: Money };

export interface SlaCommitment {
  maxLatencyMs: number;
  uptimePercentage: number; // e.g. 99.9
  maxErrorRate: number;     // e.g. 0.01 for 1%
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
