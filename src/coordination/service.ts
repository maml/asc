// Coordination service — the core engine that accepts requests, invokes
// providers, handles retries, and emits lifecycle events.

import type { AgentId, ConsumerId, TaskId, SpanId } from "../types/brand.js";
import type { CoordinationRequest, Task } from "../types/coordination.js";
import type { InvokeRequest, InvokeResponse } from "../types/provider-interface.js";
import type { Agent } from "../types/agent.js";
import type { AgentRepository } from "../registry/repository.js";
import type { TraceService } from "../observability/trace-service.js";
import type { QualityService } from "../observability/quality-service.js";
import type { SlaService } from "../observability/sla-service.js";
import type { BillingService } from "../billing/service.js";
import { CoordinationRepository } from "./repository.js";
import { CircuitBreakerManager } from "./circuit-breaker.js";

interface ProviderLookup {
  getWebhookUrl(agentId: AgentId): Promise<string | null>;
}

export class CoordinationService {
  private pendingExecutions = new Set<Promise<void>>();

  constructor(
    private coordRepo: CoordinationRepository,
    private agentRepo: AgentRepository,
    private providerLookup: ProviderLookup,
    private circuitBreaker: CircuitBreakerManager,
    private traceService?: TraceService,
    private qualityService?: QualityService,
    private slaService?: SlaService,
    private billingService?: BillingService,
  ) {}

  /** Wait for all in-flight fire-and-forget executions to settle */
  async drain(): Promise<void> {
    await Promise.allSettled(this.pendingExecutions);
  }

  /** Submit a new coordination request. Creates the coordination + task, then starts execution. */
  async submit(request: CoordinationRequest): Promise<Task> {
    // Validate agent exists and is active
    const agent = await this.agentRepo.findById(request.agentId);
    if (!agent) throw new ServiceError("AGENT_NOT_FOUND", `Agent ${request.agentId} not found`);
    if (agent.status !== "active") throw new ServiceError("AGENT_INACTIVE", `Agent ${request.agentId} is ${agent.status}`);

    // Create coordination record
    const coord = await this.coordRepo.createCoordination({
      consumerId: request.consumerId,
      agentId: request.agentId,
      priority: request.priority,
      callbackUrl: request.callbackUrl,
      metadata: request.metadata ?? {},
    });

    // Create task
    const task = await this.coordRepo.createTask({
      coordinationId: coord.id,
      agentId: request.agentId,
      consumerId: request.consumerId,
      traceId: coord.traceId,
      priority: request.priority,
      input: request.input,
      maxAttempts: request.priority === "critical" ? 5 : 3,
      timeoutMs: request.timeoutMs ?? agent.sla.maxLatencyMs,
      metadata: request.metadata ?? {},
    });

    // Emit task_created event
    await this.coordRepo.emitEvent(coord.id, coord.traceId, {
      type: "task_created",
      taskId: task.id,
    }, { agentId: request.agentId, consumerId: request.consumerId });

    // Execute asynchronously — don't block the response
    const execution = this.executeTask(task, agent).catch(() => {
      // Errors are already emitted as coordination events; no need to log here
    });
    this.pendingExecutions.add(execution);
    execution.finally(() => this.pendingExecutions.delete(execution));

    return task;
  }

  /** Execute a task with retry logic and circuit breaker checks */
  private async executeTask(task: Task, agent: Agent): Promise<void> {
    const { id: taskId, coordinationId, traceId, agentId } = task;
    let currentTask = task;

    // Start trace for this task execution
    let traceIdObs: string | undefined;
    let rootSpanId: string | undefined;
    try {
      if (this.traceService) {
        const t = await this.traceService.startTrace(task.coordinationId);
        traceIdObs = t.traceId;
      }
    } catch { /* tracing failure must not break execution */ }

    for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
      // Check circuit breaker
      if (!this.circuitBreaker.canExecute(agentId)) {
        await this.coordRepo.emitEvent(coordinationId, traceId, {
          type: "task_failed",
          taskId,
          error: "Circuit breaker is open",
          willRetry: false,
        }, { agentId });
        await this.coordRepo.updateTask(taskId, {
          status: "failed",
          error: "Circuit breaker is open for this agent",
          completedAt: new Date().toISOString(),
        });
        break;
      }

      // Start span for this attempt
      let spanId: string | undefined;
      let spanStart: number | undefined;
      try {
        if (this.traceService && traceIdObs) {
          const s = await this.traceService.startSpan(traceIdObs, `invoke-attempt-${attempt}`, rootSpanId, { agentId: task.agentId, attempt });
          spanId = s.spanId;
          spanStart = s.startTime;
          if (attempt === 1) rootSpanId = spanId;
        }
      } catch { /* tracing failure must not break execution */ }

      // Mark as in_progress
      const now = new Date().toISOString();
      currentTask = await this.coordRepo.updateTask(taskId, {
        status: "in_progress",
        attemptCount: attempt,
        startedAt: attempt === 1 ? now : currentTask.startedAt,
      });

      await this.coordRepo.emitEvent(coordinationId, traceId, {
        type: "task_started",
        taskId,
        attemptNumber: attempt,
      }, { agentId, consumerId: task.consumerId });

      // Invoke the provider
      const invokeStart = Date.now();
      try {
        const response = await this.invokeProvider(agentId, currentTask);

        if (response.status === "success") {
          // End span as ok
          try {
            if (this.traceService && spanId && spanStart) {
              await this.traceService.endSpan(spanId, spanStart, "ok");
            }
          } catch { /* tracing failure must not break execution */ }

          this.circuitBreaker.recordSuccess(agentId);

          // Run quality checks before declaring success
          if (this.qualityService) {
            const durationMs = Date.now() - invokeStart;
            const checks = await this.qualityService.runChecks(task.agentId, task.id, response.output, durationMs);
            if (!checks.passed) {
              // A required quality gate failed — treat as task failure
              await this.coordRepo.updateTask(taskId, { status: "failed", error: "Quality gate check failed" });
              await this.coordRepo.emitEvent(coordinationId, traceId, { type: "task_failed", taskId, error: "Quality gate check failed", willRetry: false }, { agentId });
              // Still complete the trace
              try {
                if (this.traceService && traceIdObs && rootSpanId) {
                  await this.traceService.completeTrace(traceIdObs, rootSpanId);
                }
              } catch { /* ignore */ }
              // Fire-and-forget SLA evaluation
              if (this.slaService) {
                this.slaService.evaluateRules(task.agentId).catch(() => {});
              }
              return;
            }
          }

          await this.coordRepo.updateTask(taskId, {
            status: "completed",
            output: response.output,
            completedAt: new Date().toISOString(),
          });
          await this.coordRepo.emitEvent(coordinationId, traceId, {
            type: "task_completed",
            taskId,
            output: response.output,
          }, { agentId });

          // Complete trace and evaluate SLAs after success
          try {
            if (this.traceService && traceIdObs && rootSpanId) {
              await this.traceService.completeTrace(traceIdObs, rootSpanId);
            }
          } catch { /* ignore */ }

          if (this.slaService) {
            this.slaService.evaluateRules(task.agentId).catch(() => {});
          }

          // Record billing for successful invocation
          if (this.billingService) {
            try {
              const durationMs = Date.now() - invokeStart;
              await this.billingService.recordInvocation(
                { id: task.id, agentId: task.agentId, consumerId: task.consumerId, traceId: task.traceId },
                durationMs
              );
            } catch { /* billing failure should not break task execution */ }
          }
          return;
        }

        // Provider returned an error — end span as error
        try {
          if (this.traceService && spanId && spanStart) {
            await this.traceService.endSpan(spanId, spanStart, "error");
          }
        } catch { /* tracing failure must not break execution */ }

        this.circuitBreaker.recordFailure(agentId);
        const willRetry = attempt < task.maxAttempts;
        await this.coordRepo.emitEvent(coordinationId, traceId, {
          type: "task_failed",
          taskId,
          error: response.error ?? "Provider returned error status",
          willRetry,
        }, { agentId });

        if (!willRetry) {
          await this.coordRepo.updateTask(taskId, {
            status: "failed",
            error: response.error ?? "Provider returned error status",
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        // Network/timeout error
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("AbortError");

        // End span with appropriate status
        try {
          if (this.traceService && spanId && spanStart) {
            await this.traceService.endSpan(spanId, spanStart, isTimeout ? "timeout" : "error");
          }
        } catch { /* tracing failure must not break execution */ }

        this.circuitBreaker.recordFailure(agentId);
        const willRetry = attempt < task.maxAttempts;

        if (isTimeout) {
          await this.coordRepo.emitEvent(coordinationId, traceId, {
            type: "task_timeout",
            taskId,
            elapsedMs: task.timeoutMs,
          }, { agentId });
        }

        await this.coordRepo.emitEvent(coordinationId, traceId, {
          type: "task_failed",
          taskId,
          error: errorMsg,
          willRetry,
        }, { agentId });

        if (!willRetry) {
          await this.coordRepo.updateTask(taskId, {
            status: "failed",
            error: errorMsg,
            completedAt: new Date().toISOString(),
          });
        }
      }

      // Brief backoff before retry
      if (attempt < task.maxAttempts) {
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10_000));
      }
    }

    // Retry loop exhausted — complete trace and evaluate SLAs
    try {
      if (this.traceService && traceIdObs && rootSpanId) {
        await this.traceService.completeTrace(traceIdObs, rootSpanId);
      }
    } catch { /* ignore */ }

    if (this.slaService) {
      this.slaService.evaluateRules(task.agentId).catch(() => {});
    }
  }

  /** Send the invoke request to the provider's webhook URL */
  private async invokeProvider(agentId: AgentId, task: Task): Promise<InvokeResponse> {
    const webhookUrl = await this.providerLookup.getWebhookUrl(agentId);
    if (!webhookUrl) throw new Error(`No webhook URL for agent ${agentId}`);

    const invokeUrl = `${webhookUrl}/invoke`;
    const spanId = crypto.randomUUID() as SpanId;

    const request: InvokeRequest = {
      taskId: task.id,
      agentId,
      traceId: task.traceId,
      spanId,
      input: task.input,
      timeoutMs: task.timeoutMs,
      metadata: task.metadata,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), task.timeoutMs);

    try {
      const res = await fetch(invokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Provider returned HTTP ${res.status}`);
      }

      return (await res.json()) as InvokeResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Get a task by ID */
  async getTask(id: TaskId): Promise<Task | null> {
    return this.coordRepo.getTask(id);
  }

  /** List tasks with optional filters */
  async listTasks(
    pagination: { cursor?: string; limit: number },
    filter?: { consumerId?: ConsumerId; agentId?: AgentId; status?: string }
  ) {
    return this.coordRepo.listTasks(pagination, filter);
  }

  /** List events for a coordination */
  async listEvents(coordinationId: string, pagination: { cursor?: string; limit: number }) {
    return this.coordRepo.listEvents(coordinationId as Task["coordinationId"], pagination);
  }
}

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
