// Pipeline service — orchestrates multi-agent chaining using the coordination engine

import type { AgentId, ConsumerId, PipelineId, PipelineExecutionId, TaskId } from "../types/brand.js";
import type { InputMapping, MappingOp, PipelineStepDef } from "../types/pipeline.js";
import type { AgentRepository } from "../registry/repository.js";
import type { CoordinationService } from "../coordination/service.js";
import { PipelineRepository } from "./repository.js";
import { ServiceError } from "../coordination/service.js";

export class PipelineService {
  private pendingExecutions = new Set<Promise<void>>();

  constructor(
    private repo: PipelineRepository,
    private agentRepo: AgentRepository,
    private coordService: CoordinationService,
  ) {}

  async drain(): Promise<void> {
    await Promise.allSettled(this.pendingExecutions);
  }

  async createPipeline(input: {
    consumerId: ConsumerId;
    name: string;
    description?: string;
    steps: PipelineStepDef[];
    priority?: "low" | "normal" | "high" | "critical";
    metadata?: Record<string, string>;
  }) {
    if (!input.steps.length) {
      throw new ServiceError("INVALID_PIPELINE", "Pipeline must have at least one step");
    }

    // Validate all agents exist and are active
    for (const step of input.steps) {
      const agent = await this.agentRepo.findById(step.agentId);
      if (!agent) throw new ServiceError("AGENT_NOT_FOUND", `Agent ${step.agentId} not found`);
      if (agent.status !== "active") throw new ServiceError("AGENT_INACTIVE", `Agent ${step.agentId} is ${agent.status}`);
    }

    return this.repo.createPipeline({
      consumerId: input.consumerId,
      name: input.name,
      description: input.description ?? "",
      steps: input.steps,
      priority: input.priority ?? "normal",
      metadata: input.metadata ?? {},
    });
  }

  async getPipeline(id: PipelineId) {
    return this.repo.getPipeline(id);
  }

  async listPipelines(consumerId: ConsumerId) {
    return this.repo.listPipelines(consumerId);
  }

  async deletePipeline(id: PipelineId) {
    return this.repo.deletePipeline(id);
  }

  async getExecution(id: PipelineExecutionId) {
    return this.repo.getExecution(id);
  }

  async listExecutions(pipelineId: PipelineId) {
    return this.repo.listExecutions(pipelineId);
  }

  async listEvents(executionId: PipelineExecutionId) {
    return this.repo.listEvents(executionId);
  }

  async execute(pipelineId: PipelineId, consumerId: ConsumerId, input: unknown, metadata?: Record<string, string>) {
    const pipeline = await this.repo.getPipeline(pipelineId);
    if (!pipeline) throw new ServiceError("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    if (pipeline.consumerId !== consumerId) throw new ServiceError("FORBIDDEN", "Not the owner of this pipeline");

    const { execution } = await this.repo.createExecution({
      pipelineId,
      consumerId,
      input,
      steps: pipeline.steps,
      metadata: metadata ?? {},
    });

    // Fire-and-forget — reuse coordination engine's pattern
    const run = this.runPipeline(execution.id, pipeline.steps, pipeline.priority, input).catch(() => {});
    this.pendingExecutions.add(run);
    run.finally(() => this.pendingExecutions.delete(run));

    return execution;
  }

  private async runPipeline(
    executionId: PipelineExecutionId,
    steps: PipelineStepDef[],
    priority: string,
    initialInput: unknown,
  ): Promise<void> {
    const exec = await this.repo.getExecution(executionId);
    if (!exec) return;

    const now = new Date().toISOString();
    await this.repo.updateExecution(executionId, { status: "running", startedAt: now });
    await this.repo.emitEvent(executionId, exec.traceId, {
      type: "pipeline_started",
      executionId,
    });

    let currentInput = initialInput;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const stepStart = Date.now();
      const stepStartTime = new Date().toISOString();

      await this.repo.updateExecution(executionId, { currentStepIndex: i });

      // Apply input mapping
      const stepInput = step.inputMapping
        ? applyMapping(currentInput, step.inputMapping)
        : currentInput;

      await this.repo.updateStepExecution(executionId, i, {
        status: "running",
        input: stepInput,
        startedAt: stepStartTime,
      });

      await this.repo.emitEvent(executionId, exec.traceId, {
        type: "pipeline_step_started",
        executionId,
        stepIndex: i,
        stepName: step.name,
        agentId: step.agentId,
      });

      try {
        // Submit to coordination engine — gets retry, circuit breaker, billing for free
        const task = await this.coordService.submit({
          consumerId: exec.consumerId,
          agentId: step.agentId,
          input: stepInput,
          priority: priority as "low" | "normal" | "high" | "critical",
          timeoutMs: step.timeoutMs,
          metadata: step.metadata,
        });

        // Poll for completion
        const completedTask = await this.pollTask(task.id, step.timeoutMs ?? 30_000);

        if (completedTask.status === "failed") {
          const error = completedTask.error ?? "Task failed";
          const durationMs = Date.now() - stepStart;

          await this.repo.updateStepExecution(executionId, i, {
            status: "failed",
            coordinationId: completedTask.coordinationId,
            taskId: completedTask.id,
            error,
            completedAt: new Date().toISOString(),
            durationMs,
          });

          await this.repo.emitEvent(executionId, exec.traceId, {
            type: "pipeline_step_failed",
            executionId,
            stepIndex: i,
            stepName: step.name,
            error,
          });

          await this.repo.updateExecution(executionId, {
            status: "failed",
            error: `Step ${i} (${step.name}) failed: ${error}`,
            failedStepIndex: i,
            completedAt: new Date().toISOString(),
          });

          await this.repo.emitEvent(executionId, exec.traceId, {
            type: "pipeline_failed",
            executionId,
            error: `Step ${i} (${step.name}) failed: ${error}`,
            failedStepIndex: i,
          });

          return;
        }

        // Step succeeded — capture output
        const durationMs = Date.now() - stepStart;
        currentInput = completedTask.output;

        await this.repo.updateStepExecution(executionId, i, {
          status: "completed",
          coordinationId: completedTask.coordinationId,
          taskId: completedTask.id,
          output: completedTask.output,
          completedAt: new Date().toISOString(),
          durationMs,
        });

        await this.repo.emitEvent(executionId, exec.traceId, {
          type: "pipeline_step_completed",
          executionId,
          stepIndex: i,
          stepName: step.name,
          output: completedTask.output,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - stepStart;

        await this.repo.updateStepExecution(executionId, i, {
          status: "failed",
          error,
          completedAt: new Date().toISOString(),
          durationMs,
        });

        await this.repo.emitEvent(executionId, exec.traceId, {
          type: "pipeline_step_failed",
          executionId,
          stepIndex: i,
          stepName: step.name,
          error,
        });

        await this.repo.updateExecution(executionId, {
          status: "failed",
          error: `Step ${i} (${step.name}) failed: ${error}`,
          failedStepIndex: i,
          completedAt: new Date().toISOString(),
        });

        await this.repo.emitEvent(executionId, exec.traceId, {
          type: "pipeline_failed",
          executionId,
          error: `Step ${i} (${step.name}) failed: ${error}`,
          failedStepIndex: i,
        });

        return;
      }
    }

    // All steps succeeded
    await this.repo.updateExecution(executionId, {
      status: "completed",
      output: currentInput,
      completedAt: new Date().toISOString(),
    });

    await this.repo.emitEvent(executionId, exec.traceId, {
      type: "pipeline_completed",
      executionId,
      output: currentInput,
    });
  }

  private async pollTask(taskId: TaskId, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = await this.coordService.getTask(taskId);
      if (task && (task.status === "completed" || task.status === "failed")) {
        return task;
      }
      await sleep(200);
    }

    throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
  }
}

// --- Input mapping ---

export function applyMapping(input: unknown, mapping: InputMapping): unknown {
  if (!mapping.length) return input;

  let result: Record<string, unknown> = typeof input === "object" && input !== null
    ? { ...(input as Record<string, unknown>) }
    : {};

  for (const op of mapping) {
    if (op.op === "pick") {
      const picked: Record<string, unknown> = {};
      for (const field of op.fields) {
        if (field in result) {
          picked[field] = result[field];
        }
      }
      result = picked;
    } else if (op.op === "merge") {
      result = { ...result, ...op.value };
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
