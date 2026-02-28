// Quality gate repository — persistence for quality gates and check records

import type pg from "pg";
import type { QualityGateId, AgentId } from "../types/brand.js";
import type {
  QualityGate,
  QualityCheckConfig,
  QualityCheckResult,
  QualityCheckRecord,
} from "../types/quality.js";

// --- Row mappers ---

function rowToGate(row: Record<string, unknown>): QualityGate {
  return {
    id: row["id"] as QualityGateId,
    agentId: row["agent_id"] as AgentId,
    name: row["name"] as string,
    description: row["description"] as string,
    check: row["check_config"] as QualityCheckConfig,
    required: row["required"] as boolean,
    createdAt: (row["created_at"] as Date).toISOString(),
  };
}

function rowToCheckRecord(row: Record<string, unknown>): QualityCheckRecord {
  return {
    gateId: row["gate_id"] as QualityGateId,
    result: row["result"] as QualityCheckResult,
    message: (row["message"] as string) ?? undefined,
    durationMs: row["duration_ms"] as number,
    checkedAt: (row["checked_at"] as Date).toISOString(),
  };
}

// --- Repository ---

export class QualityGateRepository {
  constructor(private pool: pg.Pool) {}

  async createGate(data: {
    agentId: string;
    name: string;
    description?: string;
    checkConfig: QualityCheckConfig;
    required?: boolean;
  }): Promise<QualityGate> {
    const { rows } = await this.pool.query(
      `INSERT INTO quality_gates (agent_id, name, description, check_config, required)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.agentId,
        data.name,
        data.description ?? "",
        JSON.stringify(data.checkConfig),
        data.required ?? false,
      ]
    );
    return rowToGate(rows[0] as Record<string, unknown>);
  }

  async listGates(opts?: { agentId?: string; limit?: number }): Promise<QualityGate[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.agentId) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(opts.agentId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM quality_gates ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToGate(r as Record<string, unknown>));
  }

  async getGate(id: string): Promise<QualityGate | null> {
    const { rows } = await this.pool.query("SELECT * FROM quality_gates WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToGate(rows[0] as Record<string, unknown>);
  }

  async deleteGate(id: string): Promise<void> {
    await this.pool.query("DELETE FROM quality_gates WHERE id = $1", [id]);
  }

  async recordCheck(data: {
    gateId: string;
    taskId: string;
    result: QualityCheckResult;
    message?: string;
    durationMs?: number;
  }): Promise<QualityCheckRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO quality_check_records (gate_id, task_id, result, message, duration_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.gateId, data.taskId, data.result, data.message ?? null, data.durationMs ?? 0]
    );
    return rowToCheckRecord(rows[0] as Record<string, unknown>);
  }

  async listCheckRecords(opts: {
    gateId?: string;
    taskId?: string;
    limit?: number;
  }): Promise<QualityCheckRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.gateId) {
      conditions.push(`gate_id = $${idx++}`);
      params.push(opts.gateId);
    }
    if (opts.taskId) {
      conditions.push(`task_id = $${idx++}`);
      params.push(opts.taskId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM quality_check_records ${where} ORDER BY checked_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToCheckRecord(r as Record<string, unknown>));
  }
}
