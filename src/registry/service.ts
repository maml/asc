// Registry service — business logic layer between API and repositories.
// Handles API key generation/hashing and input validation.

import crypto from "node:crypto";
import type { ProviderId, AgentId, ConsumerId } from "../types/brand.js";
import type { PaginationRequest } from "../types/common.js";
import type { ProviderOrg, ProviderRegistrationRequest } from "../types/provider.js";
import type { ConsumerOrg, ConsumerRegistrationRequest } from "../types/consumer.js";
import type { Agent, AgentRegistrationRequest } from "../types/agent.js";
import type {
  ProviderRepository,
  ConsumerRepository,
  AgentRepository,
  UpdateProviderInput,
  UpdateConsumerInput,
  UpdateAgentInput,
  ListAgentsFilter,
  Paginated,
} from "./repository.js";

function generateApiKey(): string {
  return `asc_${crypto.randomBytes(32).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export class RegistryService {
  constructor(
    private providers: ProviderRepository,
    private consumers: ConsumerRepository,
    private agents: AgentRepository
  ) {}

  // --- Providers ---

  async registerProvider(req: ProviderRegistrationRequest): Promise<{ provider: ProviderOrg; apiKey: string }> {
    const apiKey = generateApiKey();
    const provider = await this.providers.create({
      name: req.name,
      description: req.description,
      contactEmail: req.contactEmail,
      webhookUrl: req.webhookUrl,
      apiKeyHash: hashApiKey(apiKey),
      metadata: req.metadata ?? {},
    });
    return { provider, apiKey };
  }

  async getProvider(id: ProviderId): Promise<ProviderOrg | null> {
    return this.providers.findById(id);
  }

  async listProviders(pagination: PaginationRequest, status?: string): Promise<Paginated<ProviderOrg>> {
    return this.providers.list(pagination, status);
  }

  async updateProvider(id: ProviderId, input: UpdateProviderInput): Promise<ProviderOrg> {
    return this.providers.update(id, input);
  }

  async deleteProvider(id: ProviderId): Promise<void> {
    return this.providers.delete(id);
  }

  // --- Consumers ---

  async registerConsumer(req: ConsumerRegistrationRequest): Promise<{ consumer: ConsumerOrg; apiKey: string }> {
    const apiKey = generateApiKey();
    const consumer = await this.consumers.create({
      name: req.name,
      description: req.description,
      contactEmail: req.contactEmail,
      apiKeyHash: hashApiKey(apiKey),
      metadata: req.metadata ?? {},
    });
    return { consumer, apiKey };
  }

  async getConsumer(id: ConsumerId): Promise<ConsumerOrg | null> {
    return this.consumers.findById(id);
  }

  async listConsumers(pagination: PaginationRequest, status?: string): Promise<Paginated<ConsumerOrg>> {
    return this.consumers.list(pagination, status);
  }

  async updateConsumer(id: ConsumerId, input: UpdateConsumerInput): Promise<ConsumerOrg> {
    return this.consumers.update(id, input);
  }

  async deleteConsumer(id: ConsumerId): Promise<void> {
    return this.consumers.delete(id);
  }

  // --- Agents ---

  async registerAgent(providerId: ProviderId, req: AgentRegistrationRequest): Promise<Agent> {
    return this.agents.create({
      providerId,
      name: req.name,
      description: req.description,
      version: req.version,
      capabilities: req.capabilities,
      pricing: req.pricing,
      sla: req.sla,
      supportsStreaming: req.supportsStreaming,
      metadata: req.metadata ?? {},
    });
  }

  async getAgent(id: AgentId): Promise<Agent | null> {
    return this.agents.findById(id);
  }

  async listAgents(pagination: PaginationRequest, filter?: ListAgentsFilter): Promise<Paginated<Agent>> {
    return this.agents.list(pagination, filter);
  }

  async updateAgent(id: AgentId, input: UpdateAgentInput): Promise<Agent> {
    return this.agents.update(id, input);
  }

  async deleteAgent(id: AgentId): Promise<void> {
    return this.agents.delete(id);
  }
}
