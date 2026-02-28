import type { ProviderId } from "./brand.js";
import type { Timestamp, Metadata } from "./common.js";

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
  apiKey: string; // Only returned once at registration time
}
