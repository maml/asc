// Settlement types — L2-agnostic settlement abstraction

import type {
  SettlementId,
  BillingEventId,
  ProviderId,
  ConsumerId,
  AgentId,
} from "./brand.js";
import type { Timestamp } from "./common.js";

export type SettlementNetwork = "lightning" | "liquid" | "stripe" | "noop";
export type SettlementStatus = "pending" | "processing" | "settled" | "failed";

/** Dual-denomination amount tracking */
export interface SettlementAmount {
  grossAmountCents: number;
  providerAmountCents: number;
  platformFeeCents: number;
  networkFeeCents: number;
  currency: string;
  exchangeRate?: number;
}

/** Provider's settlement preferences */
export interface ProviderSettlementConfig {
  providerId: ProviderId;
  network: SettlementNetwork;
  lightningAddress?: string;
  liquidAddress?: string;
  stripeConnectAccountId?: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the adapter receives */
export interface SettlementRequest {
  billingEventId: BillingEventId;
  providerAmountCents: number;
  currency: string;
  providerConfig: ProviderSettlementConfig;
  idempotencyKey: string;
}

/** What the adapter returns */
export interface SettlementResult {
  status: "settled" | "failed";
  externalId?: string;
  externalStatus?: string;
  networkFeeCents?: number;
  exchangeRate?: number;
  error?: string;
  retryable?: boolean;
}

/** Core adapter interface — one implementation per settlement network */
export interface SettlementAdapter {
  settle(request: SettlementRequest): Promise<SettlementResult>;
  checkStatus(externalId: string): Promise<SettlementResult>;
  validateConfig(config: ProviderSettlementConfig): Promise<{ valid: boolean; error?: string }>;
}

/** DB record for a settlement attempt */
export interface Settlement {
  id: SettlementId;
  billingEventId: BillingEventId;
  providerId: ProviderId;
  consumerId: ConsumerId;
  agentId: AgentId;
  network: SettlementNetwork;
  status: SettlementStatus;
  grossAmountCents: number;
  providerAmountCents: number;
  platformFeeCents: number;
  networkFeeCents: number;
  currency: string;
  exchangeRate?: number;
  externalId?: string;
  externalStatus?: string;
  attemptCount: number;
  lastAttemptAt?: Timestamp;
  settledAt?: Timestamp;
  error?: string;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
}

/** Platform fee configuration */
export interface PlatformFeeConfig {
  defaultFeePercentage: number;
  minimumFeeCents: number;
  providerOverrides?: Record<string, number>;
}

/** Aggregated settlement summary */
export interface SettlementSummary {
  totalGrossCents: number;
  totalProviderCents: number;
  totalPlatformFeeCents: number;
  totalNetworkFeeCents: number;
  settlementCount: number;
  byNetwork: Record<string, { count: number; totalCents: number }>;
}
