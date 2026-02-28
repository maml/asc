// SLA repository — persistence for SLA rules and compliance records

import type pg from "pg";
import type { SlaRuleId, AgentId, ProviderId } from "../types/brand.js";
import type {
  SlaRule,
  SlaComplianceRecord,
  ComplianceStatus,
  SlaMetricType,
} from "../types/sla.js";

// --- Row mappers ---

function rowToRule(row: Record<string, unknown>): SlaRule {
  return {
    id: row["id"] as SlaRuleId,
    agentId: row["agent_id"] as AgentId,
    providerId: row["provider_id"] as ProviderId,
    metricType: row["metric_type"] as SlaMetricType,
    threshold: row["threshold"] as number,
    windowMinutes: row["window_minutes"] as number,
    createdAt: (row["created_at"] as Date).toISOString(),
  };
}

function rowToComplianceRecord(row: Record<string, unknown>): SlaComplianceRecord {
  return {
    id: row["id"] as string,
    ruleId: row["rule_id"] as SlaRuleId,
    agentId: row["agent_id"] as AgentId,
    status: row["status"] as ComplianceStatus,
    currentValue: row["current_value"] as number,
    threshold: row["threshold"] as number,
    evaluatedAt: (row["evaluated_at"] as Date).toISOString(),
    windowStart: (row["window_start"] as Date).toISOString(),
    windowEnd: (row["window_end"] as Date).toISOString(),
  };
}

// --- Repository ---

export class SlaRepository {
  constructor(private pool: pg.Pool) {}

  async createRule(data: {
    agentId: string;
    providerId: string;
    metricType: SlaMetricType;
    threshold: number;
    windowMinutes?: number;
  }): Promise<SlaRule> {
    const { rows } = await this.pool.query(
      `INSERT INTO sla_rules (agent_id, provider_id, metric_type, threshold, window_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.agentId, data.providerId, data.metricType, data.threshold, data.windowMinutes ?? 60]
    );
    return rowToRule(rows[0] as Record<string, unknown>);
  }

  async listRules(opts?: { agentId?: string; limit?: number }): Promise<SlaRule[]> {
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
      `SELECT * FROM sla_rules ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToRule(r as Record<string, unknown>));
  }

  async deleteRule(id: string): Promise<void> {
    await this.pool.query("DELETE FROM sla_rules WHERE id = $1", [id]);
  }

  async recordCompliance(data: {
    ruleId: string;
    agentId: string;
    status: ComplianceStatus;
    currentValue: number;
    threshold: number;
    windowStart: string;
    windowEnd: string;
  }): Promise<SlaComplianceRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO sla_compliance_records (rule_id, agent_id, status, current_value, threshold, window_start, window_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.ruleId, data.agentId, data.status, data.currentValue, data.threshold, data.windowStart, data.windowEnd]
    );
    return rowToComplianceRecord(rows[0] as Record<string, unknown>);
  }

  async listComplianceRecords(opts: {
    agentId?: string;
    ruleId?: string;
    limit?: number;
  }): Promise<SlaComplianceRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.agentId) {
      conditions.push(`agent_id = $${idx++}`);
      params.push(opts.agentId);
    }
    if (opts.ruleId) {
      conditions.push(`rule_id = $${idx++}`);
      params.push(opts.ruleId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await this.pool.query(
      `SELECT * FROM sla_compliance_records ${where} ORDER BY evaluated_at DESC LIMIT $${idx}`,
      params
    );

    return rows.map((r) => rowToComplianceRecord(r as Record<string, unknown>));
  }

  async getLatencyStats(
    agentId: string,
    windowStart: string,
    windowEnd: string
  ): Promise<{ avgLatencyMs: number; p95LatencyMs: number; taskCount: number }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*)::int AS task_count,
         COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000), 0) AS avg_latency_ms,
         COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000), 0) AS p95_latency_ms
       FROM tasks
       WHERE agent_id = $1
         AND status = 'completed'
         AND completed_at >= $2
         AND completed_at <= $3
         AND started_at IS NOT NULL`,
      [agentId, windowStart, windowEnd]
    );

    const row = rows[0] as Record<string, unknown>;
    const taskCount = row["task_count"] as number;

    if (taskCount === 0) {
      return { avgLatencyMs: 0, p95LatencyMs: 0, taskCount: 0 };
    }

    return {
      avgLatencyMs: Number(row["avg_latency_ms"]),
      p95LatencyMs: Number(row["p95_latency_ms"]),
      taskCount,
    };
  }

  async getErrorRate(
    agentId: string,
    windowStart: string,
    windowEnd: string
  ): Promise<{ errorRate: number; totalTasks: number; failedTasks: number }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_tasks
       FROM tasks
       WHERE agent_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [agentId, windowStart, windowEnd]
    );

    const row = rows[0] as Record<string, unknown>;
    const totalTasks = row["total_tasks"] as number;
    const failedTasks = row["failed_tasks"] as number;
    const errorRate = totalTasks > 0 ? failedTasks / totalTasks : 0;

    return { errorRate, totalTasks, failedTasks };
  }
}
