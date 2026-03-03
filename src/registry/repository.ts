// Repository interfaces — storage-agnostic contracts for CRUD operations

import type { ProviderId, AgentId, ConsumerId } from "../types/brand.js";
import type { PaginationRequest, PaginationResponse } from "../types/common.js";
import type { ProviderOrg } from "../types/provider.js";
import type { ConsumerOrg } from "../types/consumer.js";
import type { Agent } from "../types/agent.js";

export interface Paginated<T> {
  items: T[];
  pagination: PaginationResponse;
}

// --- Provider Repository ---

export interface CreateProviderInput {
  name: string;
  description: string;
  contactEmail: string;
  webhookUrl: string;
  apiKeyHash: string;
  metadata: Record<string, string>;
}

export interface UpdateProviderInput {
  name?: string;
  description?: string;
  contactEmail?: string;
  webhookUrl?: string;
  status?: string;
  metadata?: Record<string, string>;
}

export interface ProviderRepository {
  create(input: CreateProviderInput): Promise<ProviderOrg>;
  findById(id: ProviderId): Promise<ProviderOrg | null>;
  findByApiKeyHash(hash: string): Promise<ProviderOrg | null>;
  list(pagination: PaginationRequest, status?: string): Promise<Paginated<ProviderOrg>>;
  update(id: ProviderId, input: UpdateProviderInput): Promise<ProviderOrg>;
  delete(id: ProviderId): Promise<void>;
}

// --- Consumer Repository ---

export interface CreateConsumerInput {
  name: string;
  description: string;
  contactEmail: string;
  apiKeyHash: string;
  metadata: Record<string, string>;
}

export interface UpdateConsumerInput {
  name?: string;
  description?: string;
  contactEmail?: string;
  status?: string;
  rateLimitPerMinute?: number;
  metadata?: Record<string, string>;
}

export interface ConsumerRepository {
  create(input: CreateConsumerInput): Promise<ConsumerOrg>;
  findById(id: ConsumerId): Promise<ConsumerOrg | null>;
  findByApiKeyHash(hash: string): Promise<ConsumerOrg | null>;
  list(pagination: PaginationRequest, status?: string): Promise<Paginated<ConsumerOrg>>;
  update(id: ConsumerId, input: UpdateConsumerInput): Promise<ConsumerOrg>;
  delete(id: ConsumerId): Promise<void>;
}

// --- Agent Repository ---

export interface CreateAgentInput {
  providerId: ProviderId;
  name: string;
  description: string;
  version: string;
  capabilities: Agent["capabilities"];
  pricing: Agent["pricing"];
  sla: Agent["sla"];
  supportsStreaming: boolean;
  metadata: Record<string, string>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  version?: string;
  status?: string;
  capabilities?: Agent["capabilities"];
  pricing?: Agent["pricing"];
  sla?: Agent["sla"];
  supportsStreaming?: boolean;
  metadata?: Record<string, string>;
}

export interface ListAgentsFilter {
  providerId?: ProviderId;
  status?: string;
  capability?: string;
}

export interface AgentRepository {
  create(input: CreateAgentInput): Promise<Agent>;
  findById(id: AgentId): Promise<Agent | null>;
  list(pagination: PaginationRequest, filter?: ListAgentsFilter): Promise<Paginated<Agent>>;
  update(id: AgentId, input: UpdateAgentInput): Promise<Agent>;
  delete(id: AgentId): Promise<void>;
}
