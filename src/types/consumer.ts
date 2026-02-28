import type { ConsumerId } from "./brand.js";
import type { Timestamp, Metadata } from "./common.js";

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
