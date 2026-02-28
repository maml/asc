// REST endpoint request/response shapes for the ASC API

import type {
  ProviderId,
  AgentId,
  ConsumerId,
  CoordinationId,
  TaskId,
} from "./brand.js";
import type { PaginationRequest, PaginationResponse, ApiError } from "./common.js";
import type { ProviderOrg, ProviderRegistrationRequest, ProviderRegistrationResponse } from "./provider.js";
import type { ConsumerOrg, ConsumerRegistrationRequest, ConsumerRegistrationResponse } from "./consumer.js";
import type { Agent, AgentRegistrationRequest } from "./agent.js";
import type { Task, CoordinationRequest, CoordinationEvent } from "./coordination.js";
import type { Trace } from "./trace.js";
import type { SlaComplianceRecord } from "./sla.js";
import type { InvoiceSummary } from "./billing.js";

// --- Generic response wrapper ---

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiErrorResponse {
  data?: never;
  error: ApiError;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// --- Provider endpoints ---

export interface ListProvidersRequest extends PaginationRequest {
  status?: string;
}

export interface ListProvidersResponse {
  providers: ProviderOrg[];
  pagination: PaginationResponse;
}

export { ProviderRegistrationRequest, ProviderRegistrationResponse };

// --- Consumer endpoints ---

export interface ListConsumersRequest extends PaginationRequest {
  status?: string;
}

export interface ListConsumersResponse {
  consumers: ConsumerOrg[];
  pagination: PaginationResponse;
}

export { ConsumerRegistrationRequest, ConsumerRegistrationResponse };

// --- Agent endpoints ---

export interface ListAgentsRequest extends PaginationRequest {
  providerId?: ProviderId;
  capability?: string;
}

export interface ListAgentsResponse {
  agents: Agent[];
  pagination: PaginationResponse;
}

export interface RegisterAgentRequest extends AgentRegistrationRequest {
  providerId: ProviderId;
}

export interface RegisterAgentResponse {
  agent: Agent;
}

// --- Coordination endpoints ---

export interface CreateCoordinationResponse {
  coordinationId: CoordinationId;
  task: Task;
}

export { CoordinationRequest };

export interface GetTaskRequest {
  taskId: TaskId;
}

export interface GetTaskResponse {
  task: Task;
}

export interface ListTasksRequest extends PaginationRequest {
  consumerId?: ConsumerId;
  agentId?: AgentId;
  status?: string;
}

export interface ListTasksResponse {
  tasks: Task[];
  pagination: PaginationResponse;
}

// --- Events ---

export interface ListEventsRequest extends PaginationRequest {
  coordinationId: CoordinationId;
}

export interface ListEventsResponse {
  events: CoordinationEvent[];
  pagination: PaginationResponse;
}

// --- Traces ---

export interface GetTraceRequest {
  traceId: string;
}

export interface GetTraceResponse {
  trace: Trace;
}

// --- SLA ---

export interface GetSlaComplianceRequest {
  agentId: AgentId;
}

export interface GetSlaComplianceResponse {
  records: SlaComplianceRecord[];
}

// --- Billing ---

export interface ListInvoicesRequest extends PaginationRequest {
  consumerId: ConsumerId;
}

export interface ListInvoicesResponse {
  invoices: InvoiceSummary[];
  pagination: PaginationResponse;
}
