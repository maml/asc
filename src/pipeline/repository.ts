// Pipeline repository — persistence for pipelines, executions, steps, and events

import type pg from "pg";
import type {
  PipelineId,
  PipelineExecutionId,
  ConsumerId,
  AgentId,
  CoordinationId,
  TaskId,
  TraceId,
} from "../types/brand.js";
import type { WsBroadcaster } from "../realtime/ws-broadcaster.js";
import type {
  Pipeline,
  PipelineStepDef,
  PipelineExecution,
  PipelineStepExecution,
  PipelineEvent,
  PipelineEventPayload,
  PipelineExecutionStatus,
  PipelineStepStatus,
} from "../types/pipeline.js";

// --- Input types ---

export interface CreatePipelineInput {
  consumerId: ConsumerId;
  name: string;
  description: string;
  steps: PipelineStepDef[];
  priority: Pipeline["priority"];
  metadata: Record<string, string>;
}

export interface CreateExecutionInput {
  pipelineId: PipelineId;
  consumerId: ConsumerId;
  input: unknown;
  steps: PipelineStepDef[];
  metadata: Record<string, string>;
}

// --- Row mappers ---

function rowToPipeline(row: Record<string, unknown>): Pipeline {
  return {
    id: row["id"] as PipelineId,
    consumerId: row["consumer_id"] as ConsumerId,
    name: row["name"] as string,
    description: row["description"] as string,
    steps: row["steps"] as PipelineStepDef[],
    priority: row["priority"] as Pipeline["priority"],
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
    createdAt: (row["created_at"] as Date).toISOString(),
  };
}

function rowToExecution(row: Record<string, unknown>): PipelineExecution {
  return {
    id: row["id"] as PipelineExecutionId,
    pipelineId: row["pipeline_id"] as PipelineId,
    consumerId: row["consumer_id"] as ConsumerId,
    traceId: row["trace_id"] as TraceId,
    status: row["status"] as PipelineExecution["status"],
    input: row["input"],
    output: row["output"] ?? undefined,
    error: (row["error"] as string) ?? undefined,
    failedStepIndex: row["failed_step_index"] != null ? Number(row["failed_step_index"]) : undefined,
    currentStepIndex: Number(row["current_step_index"]),
    totalSteps: Number(row["total_steps"]),
    createdAt: (row["created_at"] as Date).toISOString(),
    startedAt: row["started_at"] ? (row["started_at"] as Date).toISOString() : undefined,
    completedAt: row["completed_at"] ? (row["completed_at"] as Date).toISOString() : undefined,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
  };
}

function rowToStepExecution(row: Record<string, unknown>): PipelineStepExecution {
  return {
    executionId: row["execution_id"] as PipelineExecutionId,
    stepIndex: Number(row["step_index"]),
    stepName: row["step_name"] as string,
    agentId: row["agent_id"] as AgentId,
    coordinationId: row["coordination_id"] ? (row["coordination_id"] as CoordinationId) : undefined,
    taskId: row["task_id"] ? (row["task_id"] as TaskId) : undefined,
    status: row["status"] as PipelineStepExecution["status"],
    input: row["input"] ?? undefined,
    output: row["output"] ?? undefined,
    error: (row["error"] as string) ?? undefined,
    startedAt: row["started_at"] ? (row["started_at"] as Date).toISOString() : undefined,
    completedAt: row["completed_at"] ? (row["completed_at"] as Date).toISOString() : undefined,
    durationMs: row["duration_ms"] != null ? Number(row["duration_ms"]) : undefined,
  };
}

function rowToEvent(row: Record<string, unknown>): PipelineEvent {
  return {
    executionId: row["execution_id"] as PipelineExecutionId,
    traceId: row["trace_id"] as TraceId,
    payload: row["payload"] as PipelineEventPayload,
    timestamp: (row["timestamp"] as Date).toISOString(),
  };
}

// --- Repository ---

export class PipelineRepository {
  constructor(private pool: pg.Pool, private broadcaster?: WsBroadcaster) {}

  // --- Pipeline CRUD ---

  async createPipeline(input: CreatePipelineInput): Promise<Pipeline> {
    const { rows } = await this.pool.query(
      `INSERT INTO pipelines (consumer_id, name, description, steps, priority, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.consumerId, input.name, input.description, JSON.stringify(input.steps), input.priority, JSON.stringify(input.metadata)]
    );
    return rowToPipeline(rows[0] as Record<string, unknown>);
  }

  async getPipeline(id: PipelineId): Promise<Pipeline | null> {
    const { rows } = await this.pool.query("SELECT * FROM pipelines WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToPipeline(rows[0] as Record<string, unknown>);
  }

  async listPipelines(consumerId: ConsumerId): Promise<Pipeline[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM pipelines WHERE consumer_id = $1 ORDER BY created_at DESC",
      [consumerId]
    );
    return rows.map((r) => rowToPipeline(r as Record<string, unknown>));
  }

  async deletePipeline(id: PipelineId): Promise<boolean> {
    const { rowCount } = await this.pool.query("DELETE FROM pipelines WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  }

  // --- Execution lifecycle ---

  async createExecution(input: CreateExecutionInput): Promise<{ execution: PipelineExecution; steps: PipelineStepExecution[] }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Insert execution
      const { rows: execRows } = await client.query(
        `INSERT INTO pipeline_executions (pipeline_id, consumer_id, input, total_steps, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.pipelineId, input.consumerId, JSON.stringify(input.input), input.steps.length, JSON.stringify(input.metadata)]
      );
      const execution = rowToExecution(execRows[0] as Record<string, unknown>);

      // Insert all step rows
      const steps: PipelineStepExecution[] = [];
      for (let i = 0; i < input.steps.length; i++) {
        const step = input.steps[i]!;
        const { rows: stepRows } = await client.query(
          `INSERT INTO pipeline_step_executions (execution_id, step_index, step_name, agent_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [execution.id, i, step.name, step.agentId]
        );
        steps.push(rowToStepExecution(stepRows[0] as Record<string, unknown>));
      }

      await client.query("COMMIT");
      return { execution, steps };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getExecution(id: PipelineExecutionId): Promise<PipelineExecution | null> {
    const { rows } = await this.pool.query("SELECT * FROM pipeline_executions WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToExecution(rows[0] as Record<string, unknown>);
  }

  async updateExecution(
    id: PipelineExecutionId,
    update: Partial<Pick<PipelineExecution, "status" | "output" | "error" | "failedStepIndex" | "currentStepIndex" | "startedAt" | "completedAt">>
  ): Promise<PipelineExecution> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (update.status !== undefined) { sets.push(`status = $${idx++}`); params.push(update.status); }
    if (update.output !== undefined) { sets.push(`output = $${idx++}`); params.push(JSON.stringify(update.output)); }
    if (update.error !== undefined) { sets.push(`error = $${idx++}`); params.push(update.error); }
    if (update.failedStepIndex !== undefined) { sets.push(`failed_step_index = $${idx++}`); params.push(update.failedStepIndex); }
    if (update.currentStepIndex !== undefined) { sets.push(`current_step_index = $${idx++}`); params.push(update.currentStepIndex); }
    if (update.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); params.push(update.startedAt); }
    if (update.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(update.completedAt); }

    if (sets.length === 0) {
      const exec = await this.getExecution(id);
      if (!exec) throw new Error(`Execution ${id} not found`);
      return exec;
    }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE pipeline_executions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new Error(`Execution ${id} not found`);
    return rowToExecution(rows[0] as Record<string, unknown>);
  }

  async listExecutions(pipelineId: PipelineId): Promise<PipelineExecution[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM pipeline_executions WHERE pipeline_id = $1 ORDER BY created_at DESC",
      [pipelineId]
    );
    return rows.map((r) => rowToExecution(r as Record<string, unknown>));
  }

  // --- Step tracking ---

  async updateStepExecution(
    executionId: PipelineExecutionId,
    stepIndex: number,
    update: Partial<Pick<PipelineStepExecution, "status" | "coordinationId" | "taskId" | "input" | "output" | "error" | "startedAt" | "completedAt" | "durationMs">>
  ): Promise<PipelineStepExecution> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (update.status !== undefined) { sets.push(`status = $${idx++}`); params.push(update.status); }
    if (update.coordinationId !== undefined) { sets.push(`coordination_id = $${idx++}`); params.push(update.coordinationId); }
    if (update.taskId !== undefined) { sets.push(`task_id = $${idx++}`); params.push(update.taskId); }
    if (update.input !== undefined) { sets.push(`input = $${idx++}`); params.push(JSON.stringify(update.input)); }
    if (update.output !== undefined) { sets.push(`output = $${idx++}`); params.push(JSON.stringify(update.output)); }
    if (update.error !== undefined) { sets.push(`error = $${idx++}`); params.push(update.error); }
    if (update.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); params.push(update.startedAt); }
    if (update.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(update.completedAt); }
    if (update.durationMs !== undefined) { sets.push(`duration_ms = $${idx++}`); params.push(update.durationMs); }

    params.push(executionId, stepIndex);
    const { rows } = await this.pool.query(
      `UPDATE pipeline_step_executions SET ${sets.join(", ")} WHERE execution_id = $${idx} AND step_index = $${idx + 1} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new Error(`Step ${stepIndex} not found for execution ${executionId}`);
    return rowToStepExecution(rows[0] as Record<string, unknown>);
  }

  async listStepExecutions(executionId: PipelineExecutionId): Promise<PipelineStepExecution[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM pipeline_step_executions WHERE execution_id = $1 ORDER BY step_index ASC",
      [executionId]
    );
    return rows.map((r) => rowToStepExecution(r as Record<string, unknown>));
  }

  // --- Events ---

  async emitEvent(
    executionId: PipelineExecutionId,
    traceId: TraceId,
    payload: PipelineEventPayload
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO pipeline_events (execution_id, trace_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [executionId, traceId, payload.type, JSON.stringify(payload)]
    );

    this.broadcaster?.broadcast({
      type: payload.type,
      payload: { ...payload, executionId, traceId },
      timestamp: new Date().toISOString(),
    });
  }

  async listEvents(executionId: PipelineExecutionId): Promise<PipelineEvent[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM pipeline_events WHERE execution_id = $1 ORDER BY timestamp ASC, id ASC",
      [executionId]
    );
    return rows.map((r) => rowToEvent(r as Record<string, unknown>));
  }
}
