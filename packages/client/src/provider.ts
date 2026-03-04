import { BaseClient, unauthenticatedPost } from "./base.js";
import type { ProviderId, AgentId, SlaRuleId, QualityGateId, CryptoKeyId } from "./types.js";
import type {
  ProviderOrg,
  ProviderRegistrationRequest,
  ProviderRegistrationResponse,
  ConsumerOrg,
  Agent,
  AgentRegistrationRequest,
  Trace,
  SlaRule,
  SlaMetricType,
  SlaComplianceRecord,
  QualityGate,
  QualityCheckConfig,
  QualityCheckRecord,
  PaginationResponse,
  RegisteredKey,
  KeyPathInfo,
  ProviderSettlementConfig,
  Settlement,
  SettlementSummary,
  SettlementNetwork,
} from "./types.js";

export interface AscProviderOptions {
  baseUrl: string;
  apiKey?: string;
  privateKey?: Uint8Array;
  providerId: ProviderId;
}

export class AscProvider extends BaseClient {
  readonly providerId: ProviderId;

  constructor(opts: AscProviderOptions) {
    if (!opts.apiKey && !opts.privateKey) {
      throw new Error("Either apiKey or privateKey must be provided");
    }
    super(
      opts.baseUrl,
      opts.apiKey ?? "",
      opts.privateKey ? { privateKey: opts.privateKey } : undefined,
    );
    this.providerId = opts.providerId;
  }

  // --- Self management ---

  async getProfile(): Promise<ProviderOrg> {
    return this.request("GET", `/api/providers/${this.providerId}`);
  }

  async update(fields: Partial<ProviderOrg>): Promise<ProviderOrg> {
    return this.request("PATCH", `/api/providers/${this.providerId}`, fields);
  }

  async delete(): Promise<void> {
    return this.request("DELETE", `/api/providers/${this.providerId}`);
  }

  // --- Agent management ---

  async registerAgent(body: AgentRegistrationRequest): Promise<Agent> {
    const res = await this.request<{ agent: Agent }>(
      "POST",
      `/api/providers/${this.providerId}/agents`,
      body,
    );
    return res.agent;
  }

  async listAgents(
    opts?: {
      cursor?: string; limit?: number; status?: string; capability?: string;
      search?: string; pricingType?: string; sort?: "name" | "created_at" | "price"; sortDir?: "asc" | "desc";
    },
  ): Promise<{ agents: Agent[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    params.set("providerId", this.providerId);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    if (opts?.capability) params.set("capability", opts.capability);
    if (opts?.search) params.set("search", opts.search);
    if (opts?.pricingType) params.set("pricingType", opts.pricingType);
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.sortDir) params.set("sortDir", opts.sortDir);
    return this.request("GET", `/api/agents?${params}`);
  }

  async getAgent(agentId: AgentId | string): Promise<Agent> {
    return this.request("GET", `/api/agents/${agentId}`);
  }

  async getAgentStats(agentId: AgentId | string): Promise<{
    totalInvocations: number; successRate: number; avgLatencyMs: number;
    last30Days: { invocations: number; revenue: number };
  }> {
    return this.request("GET", `/api/agents/${agentId}/stats`);
  }

  async updateAgent(agentId: AgentId | string, fields: Partial<Agent>): Promise<Agent> {
    return this.request("PATCH", `/api/agents/${agentId}`, fields);
  }

  async deleteAgent(agentId: AgentId | string): Promise<void> {
    return this.request("DELETE", `/api/agents/${agentId}`);
  }

  // --- Discovery ---

  async listProviders(
    opts?: { cursor?: string; limit?: number; status?: string },
  ): Promise<{ providers: ProviderOrg[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    return this.request("GET", `/api/providers?${params}`);
  }

  async listConsumers(
    opts?: { cursor?: string; limit?: number; status?: string },
  ): Promise<{ consumers: ConsumerOrg[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    return this.request("GET", `/api/consumers?${params}`);
  }

  // --- Observability: Traces ---

  async listTraces(
    opts?: { limit?: number; offset?: string },
  ): Promise<{ traces: Trace[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", opts.offset);
    return this.request("GET", `/api/traces?${params}`);
  }

  async getTrace(traceId: string): Promise<Trace> {
    const res = await this.request<{ trace: Trace }>("GET", `/api/traces/${traceId}`);
    return res.trace;
  }

  // --- SLA ---

  async createSlaRule(body: {
    agentId: AgentId | string;
    providerId: ProviderId | string;
    metricType: SlaMetricType;
    threshold: number;
    windowMinutes?: number;
  }): Promise<SlaRule> {
    const res = await this.request<{ rule: SlaRule }>("POST", "/api/sla-rules", body);
    return res.rule;
  }

  async listSlaRules(
    opts?: { agentId?: string; limit?: number },
  ): Promise<SlaRule[]> {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set("agentId", opts.agentId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await this.request<{ rules: SlaRule[] }>("GET", `/api/sla-rules?${params}`);
    return res.rules;
  }

  async deleteSlaRule(ruleId: SlaRuleId | string): Promise<void> {
    return this.request("DELETE", `/api/sla-rules/${ruleId}`);
  }

  async evaluateSlaRules(agentId: AgentId | string): Promise<SlaComplianceRecord[]> {
    const res = await this.request<{ records: SlaComplianceRecord[] }>(
      "POST",
      "/api/sla-rules/evaluate",
      { agentId },
    );
    return res.records;
  }

  // --- Quality Gates ---

  async createQualityGate(body: {
    agentId: AgentId | string;
    name: string;
    description?: string;
    checkConfig: QualityCheckConfig;
    required?: boolean;
  }): Promise<QualityGate> {
    const res = await this.request<{ gate: QualityGate }>("POST", "/api/quality-gates", body);
    return res.gate;
  }

  async listQualityGates(
    opts?: { agentId?: string; limit?: number },
  ): Promise<QualityGate[]> {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set("agentId", opts.agentId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await this.request<{ gates: QualityGate[] }>("GET", `/api/quality-gates?${params}`);
    return res.gates;
  }

  async deleteQualityGate(gateId: QualityGateId | string): Promise<void> {
    return this.request("DELETE", `/api/quality-gates/${gateId}`);
  }

  async listQualityChecks(
    opts?: { gateId?: string; taskId?: string; limit?: number },
  ): Promise<QualityCheckRecord[]> {
    const params = new URLSearchParams();
    if (opts?.gateId) params.set("gateId", opts.gateId);
    if (opts?.taskId) params.set("taskId", opts.taskId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await this.request<{ records: QualityCheckRecord[] }>(
      "GET",
      `/api/quality-checks?${params}`,
    );
    return res.records;
  }
  // --- Key Management ---

  async registerKey(publicKey: string, opts?: { keyPath?: KeyPathInfo; label?: string }): Promise<RegisteredKey> {
    return this.request("POST", "/api/keys", { publicKey, ...opts });
  }

  async listKeys(): Promise<RegisteredKey[]> {
    const res = await this.request<{ data: RegisteredKey[] }>("GET", "/api/keys");
    // The response wraps in { data: keys }, but our request() unwraps { data: T }
    return res as unknown as RegisteredKey[];
  }

  async revokeKey(keyId: CryptoKeyId | string): Promise<RegisteredKey> {
    return this.request("DELETE", `/api/keys/${keyId}`);
  }

  // --- Settlement ---

  async getSettlementConfig(): Promise<ProviderSettlementConfig> {
    const res = await this.request<{ config: ProviderSettlementConfig }>(
      "GET",
      `/api/providers/${this.providerId}/settlement-config`,
    );
    return res.config;
  }

  async updateSettlementConfig(config: {
    network: SettlementNetwork;
    lightningAddress?: string;
    liquidAddress?: string;
    stripeConnectAccountId?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderSettlementConfig> {
    const res = await this.request<{ config: ProviderSettlementConfig }>(
      "PUT",
      `/api/providers/${this.providerId}/settlement-config`,
      config,
    );
    return res.config;
  }

  async deleteSettlementConfig(): Promise<void> {
    return this.request("DELETE", `/api/providers/${this.providerId}/settlement-config`);
  }

  async listSettlements(
    opts?: { status?: string; network?: string; limit?: number },
  ): Promise<Settlement[]> {
    const params = new URLSearchParams();
    params.set("providerId", this.providerId);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.network) params.set("network", opts.network);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await this.request<{ settlements: Settlement[] }>(
      "GET",
      `/api/settlements?${params}`,
    );
    return res.settlements;
  }

  async getSettlementSummary(opts: {
    periodStart: string;
    periodEnd: string;
  }): Promise<SettlementSummary> {
    const params = new URLSearchParams();
    params.set("providerId", this.providerId);
    params.set("periodStart", opts.periodStart);
    params.set("periodEnd", opts.periodEnd);
    const res = await this.request<{ summary: SettlementSummary }>(
      "GET",
      `/api/settlements/summary?${params}`,
    );
    return res.summary;
  }
}

// Standalone registration (no auth required)
export async function registerProvider(
  baseUrl: string,
  body: ProviderRegistrationRequest,
): Promise<ProviderRegistrationResponse> {
  return unauthenticatedPost<ProviderRegistrationResponse>(baseUrl, "/api/providers", body);
}
