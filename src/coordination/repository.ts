// Coordination repository — persistence for coordinations, tasks, and events

import type pg from "pg";
import type {
  CoordinationId,
  TaskId,
  AgentId,
  ConsumerId,
  TraceId,
} from "../types/brand.js";
import type { WsBroadcaster, BroadcastEvent } from "../realtime/ws-broadcaster.js";
import type { PaginationRequest } from "../types/common.js";
import type {
  Task,
  CoordinationEvent,
  CoordinationEventPayload,
  TaskPriority,
} from "../types/coordination.js";
import type { Paginated } from "../registry/repository.js";

// --- Input types ---

export interface CreateCoordinationInput {
  consumerId: ConsumerId;
  agentId: AgentId;
  priority: TaskPriority;
  callbackUrl?: string;
  metadata: Record<string, string>;
}

export interface CreateTaskInput {
  coordinationId: CoordinationId;
  agentId: AgentId;
  consumerId: ConsumerId;
  traceId: TraceId;
  priority: TaskPriority;
  input: unknown;
  maxAttempts: number;
  timeoutMs: number;
  metadata: Record<string, string>;
}

// --- Row mappers ---

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row["id"] as TaskId,
    coordinationId: row["coordination_id"] as CoordinationId,
    agentId: row["agent_id"] as AgentId,
    consumerId: row["consumer_id"] as ConsumerId,
    traceId: row["trace_id"] as TraceId,
    status: row["status"] as Task["status"],
    priority: row["priority"] as TaskPriority,
    input: row["input"],
    output: row["output"] ?? undefined,
    error: (row["error"] as string) ?? undefined,
    attemptCount: row["attempt_count"] as number,
    maxAttempts: row["max_attempts"] as number,
    timeoutMs: row["timeout_ms"] as number,
    createdAt: (row["created_at"] as Date).toISOString(),
    startedAt: row["started_at"] ? (row["started_at"] as Date).toISOString() : undefined,
    completedAt: row["completed_at"] ? (row["completed_at"] as Date).toISOString() : undefined,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
  };
}

function rowToEvent(row: Record<string, unknown>): CoordinationEvent {
  return {
    coordinationId: row["coordination_id"] as CoordinationId,
    payload: row["payload"] as CoordinationEventPayload,
    timestamp: (row["timestamp"] as Date).toISOString(),
    traceId: row["trace_id"] as TraceId,
  };
}

// --- Repository ---

export class CoordinationRepository {
  constructor(private pool: pg.Pool, private broadcaster?: WsBroadcaster) {}

  async createCoordination(input: CreateCoordinationInput): Promise<{ id: CoordinationId; traceId: TraceId }> {
    const { rows } = await this.pool.query(
      `INSERT INTO coordinations (consumer_id, agent_id, priority, callback_url, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, trace_id`,
      [input.consumerId, input.agentId, input.priority, input.callbackUrl ?? null, JSON.stringify(input.metadata)]
    );
    const row = rows[0] as Record<string, unknown>;
    return { id: row["id"] as CoordinationId, traceId: row["trace_id"] as TraceId };
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const { rows } = await this.pool.query(
      `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, max_attempts, timeout_ms, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.coordinationId, input.agentId, input.consumerId, input.traceId,
        input.priority, JSON.stringify(input.input), input.maxAttempts,
        input.timeoutMs, JSON.stringify(input.metadata),
      ]
    );
    return rowToTask(rows[0] as Record<string, unknown>);
  }

  async getTask(id: TaskId): Promise<Task | null> {
    const { rows } = await this.pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToTask(rows[0] as Record<string, unknown>);
  }

  async updateTask(
    id: TaskId,
    update: Partial<Pick<Task, "status" | "output" | "error" | "attemptCount" | "startedAt" | "completedAt">>
  ): Promise<Task> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (update.status !== undefined) { sets.push(`status = $${idx++}`); params.push(update.status); }
    if (update.output !== undefined) { sets.push(`output = $${idx++}`); params.push(JSON.stringify(update.output)); }
    if (update.error !== undefined) { sets.push(`error = $${idx++}`); params.push(update.error); }
    if (update.attemptCount !== undefined) { sets.push(`attempt_count = $${idx++}`); params.push(update.attemptCount); }
    if (update.startedAt !== undefined) { sets.push(`started_at = $${idx++}`); params.push(update.startedAt); }
    if (update.completedAt !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(update.completedAt); }

    if (sets.length === 0) {
      const task = await this.getTask(id);
      if (!task) throw new Error(`Task ${id} not found`);
      return task;
    }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new Error(`Task ${id} not found`);
    return rowToTask(rows[0] as Record<string, unknown>);
  }

  async listTasks(
    pagination: PaginationRequest,
    filter?: { consumerId?: ConsumerId; agentId?: AgentId; status?: string }
  ): Promise<Paginated<Task>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.consumerId) { conditions.push(`consumer_id = $${idx++}`); params.push(filter.consumerId); }
    if (filter?.agentId) { conditions.push(`agent_id = $${idx++}`); params.push(filter.agentId); }
    if (filter?.status) { conditions.push(`status = $${idx++}`); params.push(filter.status); }
    if (pagination.cursor) { conditions.push(`id < $${idx++}`); params.push(pagination.cursor); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(pagination.limit + 1);

    const { rows } = await this.pool.query(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC, id DESC LIMIT $${idx}`,
      params
    );

    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(
      (r) => rowToTask(r as Record<string, unknown>)
    );
    const lastItem = items[items.length - 1];

    return {
      items,
      pagination: {
        hasMore,
        nextCursor: hasMore && lastItem ? lastItem.id : undefined,
      },
    };
  }

  async emitEvent(coordinationId: CoordinationId, traceId: TraceId, payload: CoordinationEventPayload): Promise<void> {
    await this.pool.query(
      `INSERT INTO coordination_events (coordination_id, trace_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [coordinationId, traceId, payload.type, JSON.stringify(payload)]
    );

    // Broadcast to connected WebSocket clients
    this.broadcaster?.broadcast({
      type: payload.type,
      payload: { coordinationId, traceId, ...payload },
      timestamp: new Date().toISOString(),
    });
  }

  async listEvents(
    coordinationId: CoordinationId,
    pagination: PaginationRequest
  ): Promise<Paginated<CoordinationEvent>> {
    const params: unknown[] = [coordinationId];
    let idx = 2;
    const conditions = ["coordination_id = $1"];

    if (pagination.cursor) {
      conditions.push(`id < $${idx++}`);
      params.push(parseInt(pagination.cursor, 10));
    }

    params.push(pagination.limit + 1);

    const { rows } = await this.pool.query(
      `SELECT * FROM coordination_events WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC, id DESC LIMIT $${idx}`,
      params
    );

    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(
      (r) => rowToEvent(r as Record<string, unknown>)
    );

    return {
      items,
      pagination: {
        hasMore,
        nextCursor: hasMore ? String((rows[pagination.limit - 1] as Record<string, unknown>)["id"]) : undefined,
      },
    };
  }
}
