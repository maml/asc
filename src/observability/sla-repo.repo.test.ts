import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain } from "../test/helpers.js";
import { SlaRepository } from "./sla-repo.js";

describe("SlaRepository", () => {
  const pool = getTestPool();
  const repo = new SlaRepository(pool);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  // --- createRule ---

  it("createRule stores and returns rule", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const rule = await repo.createRule({
      agentId: agent.id,
      providerId: provider.id,
      metricType: "latency",
      threshold: 500,
      windowMinutes: 30,
    });

    expect(rule.id).toBeDefined();
    expect(rule.agentId).toBe(agent.id);
    expect(rule.providerId).toBe(provider.id);
    expect(rule.metricType).toBe("latency");
    expect(Number(rule.threshold)).toBe(500);
    expect(rule.windowMinutes).toBe(30);
    expect(rule.createdAt).toBeDefined();
  });

  it("createRule defaults windowMinutes to 60", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const rule = await repo.createRule({
      agentId: agent.id,
      providerId: provider.id,
      metricType: "error_rate",
      threshold: 0.05,
    });

    expect(rule.windowMinutes).toBe(60);
  });

  // --- listRules ---

  it("listRules filters by agentId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);

    await repo.createRule({
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      metricType: "latency",
      threshold: 500,
    });
    await repo.createRule({
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      metricType: "error_rate",
      threshold: 0.01,
    });
    await repo.createRule({
      agentId: chain2.agent.id,
      providerId: chain2.provider.id,
      metricType: "uptime",
      threshold: 99.9,
    });

    const rules = await repo.listRules({ agentId: chain1.agent.id });
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.agentId === chain1.agent.id)).toBe(true);
    // Ordered by created_at DESC — error_rate rule created second comes first
    expect(rules[0].metricType).toBe("error_rate");
    expect(rules[1].metricType).toBe("latency");
  });

  // --- deleteRule ---

  it("deleteRule removes rule", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const rule = await repo.createRule({
      agentId: agent.id,
      providerId: provider.id,
      metricType: "throughput",
      threshold: 100,
    });

    await repo.deleteRule(rule.id);

    const rules = await repo.listRules({ agentId: agent.id });
    expect(rules).toHaveLength(0);
  });

  // --- recordCompliance ---

  it("recordCompliance stores and returns record", async () => {
    const { agent, provider } = await createFullEntityChain(pool);

    const rule = await repo.createRule({
      agentId: agent.id,
      providerId: provider.id,
      metricType: "latency",
      threshold: 500,
    });

    const windowStart = new Date("2026-03-01T00:00:00Z").toISOString();
    const windowEnd = new Date("2026-03-01T01:00:00Z").toISOString();

    const record = await repo.recordCompliance({
      ruleId: rule.id,
      agentId: agent.id,
      status: "compliant",
      currentValue: 320,
      threshold: 500,
      windowStart,
      windowEnd,
    });

    expect(record.id).toBeDefined();
    expect(record.ruleId).toBe(rule.id);
    expect(record.agentId).toBe(agent.id);
    expect(record.status).toBe("compliant");
    expect(Number(record.currentValue)).toBe(320);
    expect(Number(record.threshold)).toBe(500);
    expect(record.evaluatedAt).toBeDefined();
    expect(record.windowStart).toBeDefined();
    expect(record.windowEnd).toBeDefined();
  });

  // --- listComplianceRecords ---

  it("listComplianceRecords filters by agentId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);

    const rule1 = await repo.createRule({
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      metricType: "latency",
      threshold: 500,
    });
    const rule2 = await repo.createRule({
      agentId: chain2.agent.id,
      providerId: chain2.provider.id,
      metricType: "latency",
      threshold: 500,
    });

    const windowStart = new Date("2026-03-01T00:00:00Z").toISOString();
    const windowEnd = new Date("2026-03-01T01:00:00Z").toISOString();

    await repo.recordCompliance({
      ruleId: rule1.id,
      agentId: chain1.agent.id,
      status: "compliant",
      currentValue: 300,
      threshold: 500,
      windowStart,
      windowEnd,
    });
    await repo.recordCompliance({
      ruleId: rule2.id,
      agentId: chain2.agent.id,
      status: "violated",
      currentValue: 700,
      threshold: 500,
      windowStart,
      windowEnd,
    });

    const records = await repo.listComplianceRecords({ agentId: chain1.agent.id });
    expect(records).toHaveLength(1);
    expect(records[0].agentId).toBe(chain1.agent.id);
    expect(records[0].status).toBe("compliant");
  });

  // --- getLatencyStats ---

  it("getLatencyStats returns correct avg and p95 for completed tasks", async () => {
    const { agent, taskId, coordinationId, consumer, traceId } = await createFullEntityChain(pool);

    // We need multiple tasks with known latencies.
    // Task 1 (from chain): 100ms latency
    const base = new Date("2026-03-01T00:10:00Z");
    await pool.query(
      `UPDATE tasks SET status='completed', started_at=$1, completed_at=$2 WHERE id=$3`,
      [base, new Date(base.getTime() + 100), taskId]
    );

    // Create additional tasks with different latencies
    const latencies = [200, 300, 400, 1000]; // ms
    for (const ms of latencies) {
      const { rows } = await pool.query(
        `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, max_attempts, timeout_ms, metadata, status, started_at, completed_at)
         VALUES ($1, $2, $3, $4, 'normal', $5, 3, 30000, '{}', 'completed', $6, $7)
         RETURNING id`,
        [
          coordinationId,
          agent.id,
          consumer.id,
          traceId,
          JSON.stringify({ test: true }),
          base,
          new Date(base.getTime() + ms),
        ]
      );
    }

    const windowStart = new Date("2026-03-01T00:00:00Z").toISOString();
    const windowEnd = new Date("2026-03-01T01:00:00Z").toISOString();

    const stats = await repo.getLatencyStats(agent.id, windowStart, windowEnd);

    expect(stats.taskCount).toBe(5);
    // Latencies: 100, 200, 300, 400, 1000 → avg = 400
    expect(stats.avgLatencyMs).toBeCloseTo(400, 0);
    // p95 should be near 1000 (for 5 values, p95 interpolates between 400 and 1000)
    expect(stats.p95LatencyMs).toBeGreaterThan(500);
    expect(stats.p95LatencyMs).toBeLessThanOrEqual(1000);
  });

  it("getLatencyStats returns zeros when no matching tasks", async () => {
    const { agent } = await createFullEntityChain(pool);

    const windowStart = new Date("2026-03-01T00:00:00Z").toISOString();
    const windowEnd = new Date("2026-03-01T01:00:00Z").toISOString();

    const stats = await repo.getLatencyStats(agent.id, windowStart, windowEnd);

    expect(stats.taskCount).toBe(0);
    expect(stats.avgLatencyMs).toBe(0);
    expect(stats.p95LatencyMs).toBe(0);
  });

  // --- getErrorRate ---

  it("getErrorRate returns correct rate", async () => {
    const { agent, taskId, coordinationId, consumer, traceId } = await createFullEntityChain(pool);

    const baseTime = new Date("2026-03-01T00:10:00Z");

    // Mark the initial task as failed
    await pool.query(
      `UPDATE tasks SET status='failed', created_at=$1 WHERE id=$2`,
      [baseTime, taskId]
    );

    // Create 3 more completed tasks and 1 more failed task (total: 5 tasks, 2 failed)
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, max_attempts, timeout_ms, metadata, status, created_at)
         VALUES ($1, $2, $3, $4, 'normal', $5, 3, 30000, '{}', 'completed', $6)`,
        [coordinationId, agent.id, consumer.id, traceId, JSON.stringify({ test: true }), baseTime]
      );
    }
    await pool.query(
      `INSERT INTO tasks (coordination_id, agent_id, consumer_id, trace_id, priority, input, max_attempts, timeout_ms, metadata, status, created_at)
       VALUES ($1, $2, $3, $4, 'normal', $5, 3, 30000, '{}', 'failed', $6)`,
      [coordinationId, agent.id, consumer.id, traceId, JSON.stringify({ test: true }), baseTime]
    );

    const windowStart = new Date("2026-03-01T00:00:00Z").toISOString();
    const windowEnd = new Date("2026-03-01T01:00:00Z").toISOString();

    const result = await repo.getErrorRate(agent.id, windowStart, windowEnd);

    expect(result.totalTasks).toBe(5);
    expect(result.failedTasks).toBe(2);
    expect(result.errorRate).toBeCloseTo(0.4, 5);
  });
});
