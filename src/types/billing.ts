import type {
  BillingEventId,
  InvoiceId,
  AgentId,
  ProviderId,
  ConsumerId,
  TaskId,
} from "./brand.js";
import type { Timestamp, Money } from "./common.js";
import type { PricingModel } from "./agent.js";

export type BillingEventType = "invocation" | "streaming_session" | "adjustment" | "refund";

/** Frozen at billing time so price changes don't retroactively alter bills */
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
