import { BaseClient, unauthenticatedPost } from "./base.js";
import type { ProviderId, AgentId, SlaRuleId, QualityGateId } from "./types.js";
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
} from "./types.js";

export interface AscProviderOptions {
  baseUrl: string;
  apiKey: string;
  providerId: ProviderId;
}

export class AscProvider extends BaseClient {
  readonly providerId: ProviderId;

  constructor(opts: AscProviderOptions) {
    super(opts.baseUrl, opts.apiKey);
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
    opts?: { cursor?: string; limit?: number; status?: string; capability?: string },
  ): Promise<{ agents: Agent[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    params.set("providerId", this.providerId);
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    if (opts?.capability) params.set("capability", opts.capability);
    return this.request("GET", `/api/agents?${params}`);
  }

  async getAgent(agentId: AgentId | string): Promise<Agent> {
    return this.request("GET", `/api/agents/${agentId}`);
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
}

// Standalone registration (no auth required)
export async function registerProvider(
  baseUrl: string,
  body: ProviderRegistrationRequest,
): Promise<ProviderRegistrationResponse> {
  return unauthenticatedPost<ProviderRegistrationResponse>(baseUrl, "/api/providers", body);
}
