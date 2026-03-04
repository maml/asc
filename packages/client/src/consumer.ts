import { BaseClient, unauthenticatedPost } from "./base.js";
import { AscTimeoutError } from "./errors.js";
import type { ConsumerId, AgentId, CoordinationId, TaskId, PipelineId, PipelineExecutionId, CryptoKeyId } from "./types.js";
import type {
  ConsumerOrg,
  ConsumerRegistrationRequest,
  ConsumerRegistrationResponse,
  ProviderOrg,
  Agent,
  Task,
  CoordinationEvent,
  BillingEvent,
  Trace,
  PaginationResponse,
  Pipeline,
  PipelineExecution,
  PipelineStepExecution,
  PipelineEvent,
  PipelineStepDef,
  RegisteredKey,
  KeyPathInfo,
} from "./types.js";

export interface AscConsumerOptions {
  baseUrl: string;
  apiKey?: string;
  privateKey?: Uint8Array;
  consumerId: ConsumerId;
}

export class AscConsumer extends BaseClient {
  readonly consumerId: ConsumerId;

  constructor(opts: AscConsumerOptions) {
    if (!opts.apiKey && !opts.privateKey) {
      throw new Error("Either apiKey or privateKey must be provided");
    }
    super(
      opts.baseUrl,
      opts.apiKey ?? "",
      opts.privateKey ? { privateKey: opts.privateKey } : undefined,
    );
    this.consumerId = opts.consumerId;
  }

  // --- Self management ---

  async getProfile(): Promise<ConsumerOrg> {
    return this.request("GET", `/api/consumers/${this.consumerId}`);
  }

  async update(fields: Partial<ConsumerOrg>): Promise<ConsumerOrg> {
    return this.request("PATCH", `/api/consumers/${this.consumerId}`, fields);
  }

  async delete(): Promise<void> {
    return this.request("DELETE", `/api/consumers/${this.consumerId}`);
  }

  // --- Coordination ---

  async submit(body: {
    agentId: AgentId | string;
    input: unknown;
    priority?: string;
    callbackUrl?: string;
    timeoutMs?: number;
    metadata?: Record<string, string>;
  }): Promise<{ coordinationId: string; task: Task }> {
    return this.request("POST", "/api/coordinations", body);
  }

  async getTask(taskId: TaskId | string): Promise<Task> {
    return this.request("GET", `/api/tasks/${taskId}`);
  }

  async listTasks(
    opts?: { cursor?: string; limit?: number; agentId?: string; status?: string },
  ): Promise<{ tasks: Task[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.agentId) params.set("agentId", opts.agentId);
    if (opts?.status) params.set("status", opts.status);
    return this.request("GET", `/api/tasks?${params}`);
  }

  async waitForCompletion(
    taskId: TaskId | string,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<Task> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const intervalMs = opts?.intervalMs ?? 500;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = await this.getTask(taskId);
      if (task.status === "completed" || task.status === "failed") {
        return task;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new AscTimeoutError(taskId, timeoutMs);
  }

  async listEvents(
    coordinationId: CoordinationId | string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<{ events: CoordinationEvent[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    return this.request("GET", `/api/coordinations/${coordinationId}/events?${params}`);
  }

  // --- Discovery ---

  async listAgents(
    opts?: {
      cursor?: string; limit?: number; providerId?: string; status?: string; capability?: string;
      search?: string; pricingType?: string; sort?: "name" | "created_at" | "price"; sortDir?: "asc" | "desc";
    },
  ): Promise<{ agents: Agent[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.providerId) params.set("providerId", opts.providerId);
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

  async listProviders(
    opts?: { cursor?: string; limit?: number; status?: string },
  ): Promise<{ providers: ProviderOrg[]; pagination: PaginationResponse }> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.status) params.set("status", opts.status);
    return this.request("GET", `/api/providers?${params}`);
  }

  // --- Billing ---

  async listBillingEvents(
    opts?: { agentId?: string; limit?: number },
  ): Promise<BillingEvent[]> {
    const params = new URLSearchParams();
    if (opts?.agentId) params.set("agentId", opts.agentId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const res = await this.request<{ events: BillingEvent[] }>(
      "GET",
      `/api/billing-events?${params}`,
    );
    return res.events;
  }

  async getUsageSummary(opts: {
    periodStart: string;
    periodEnd: string;
    agentId?: string;
  }): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    params.set("periodStart", opts.periodStart);
    params.set("periodEnd", opts.periodEnd);
    if (opts.agentId) params.set("agentId", opts.agentId);
    const res = await this.request<{ summary: Record<string, unknown> }>(
      "GET",
      `/api/billing/usage?${params}`,
    );
    return res.summary;
  }

  async getMonthToDateSpend(): Promise<{ totalCents: number; currency: string }> {
    return this.request("GET", "/api/billing/mtd");
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

  // --- Pipelines ---

  async createPipeline(body: {
    name: string;
    description?: string;
    steps: PipelineStepDef[];
    priority?: string;
    metadata?: Record<string, string>;
  }): Promise<Pipeline> {
    return this.request("POST", "/api/pipelines", body);
  }

  async getPipeline(id: PipelineId | string): Promise<Pipeline> {
    return this.request("GET", `/api/pipelines/${id}`);
  }

  async listPipelines(): Promise<{ pipelines: Pipeline[] }> {
    return this.request("GET", "/api/pipelines");
  }

  async deletePipeline(id: PipelineId | string): Promise<void> {
    return this.request("DELETE", `/api/pipelines/${id}`);
  }

  async executePipeline(
    id: PipelineId | string,
    body?: { input?: unknown; metadata?: Record<string, string> },
  ): Promise<PipelineExecution> {
    return this.request("POST", `/api/pipelines/${id}/execute`, body ?? {});
  }

  async getPipelineExecution(id: PipelineExecutionId | string): Promise<PipelineExecution> {
    return this.request("GET", `/api/pipeline-executions/${id}`);
  }

  async listPipelineExecutions(pipelineId: PipelineId | string): Promise<{ executions: PipelineExecution[] }> {
    return this.request("GET", `/api/pipelines/${pipelineId}/executions`);
  }

  async listPipelineEvents(executionId: PipelineExecutionId | string): Promise<{ events: PipelineEvent[] }> {
    return this.request("GET", `/api/pipeline-executions/${executionId}/events`);
  }

  async listPipelineSteps(executionId: PipelineExecutionId | string): Promise<{ steps: PipelineStepExecution[] }> {
    return this.request("GET", `/api/pipeline-executions/${executionId}/steps`);
  }

  async waitForPipeline(
    executionId: PipelineExecutionId | string,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<PipelineExecution> {
    const timeoutMs = opts?.timeoutMs ?? 120_000;
    const intervalMs = opts?.intervalMs ?? 1_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const exec = await this.getPipelineExecution(executionId);
      if (exec.status === "completed" || exec.status === "failed") {
        return exec;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new AscTimeoutError(executionId, timeoutMs);
  }
  // --- Key Management ---

  async registerKey(publicKey: string, opts?: { keyPath?: KeyPathInfo; label?: string }): Promise<RegisteredKey> {
    return this.request("POST", "/api/keys", { publicKey, ...opts });
  }

  async listKeys(): Promise<RegisteredKey[]> {
    const res = await this.request<{ data: RegisteredKey[] }>("GET", "/api/keys");
    return res as unknown as RegisteredKey[];
  }

  async revokeKey(keyId: CryptoKeyId | string): Promise<RegisteredKey> {
    return this.request("DELETE", `/api/keys/${keyId}`);
  }
}

// Standalone registration (no auth required)
export async function registerConsumer(
  baseUrl: string,
  body: ConsumerRegistrationRequest,
): Promise<ConsumerRegistrationResponse> {
  return unauthenticatedPost<ConsumerRegistrationResponse>(baseUrl, "/api/consumers", body);
}
