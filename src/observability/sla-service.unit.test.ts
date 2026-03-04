// Unit tests for SlaService — mocked SlaRepository

import { describe, it, expect, vi } from "vitest";
import { SlaService } from "./sla-service.js";
import type { SlaRepository } from "./sla-repo.js";
import type { SlaRule, SlaComplianceRecord, SlaMetricType } from "../types/sla.js";
import type { SlaRuleId, AgentId, ProviderId } from "../types/brand.js";

// --- Helpers ---

const AGENT_ID = "agent-1" as AgentId;

function makeRule(overrides: Partial<SlaRule> = {}): SlaRule {
  return {
    id: "rule-1" as SlaRuleId,
    agentId: AGENT_ID,
    providerId: "prov-1" as ProviderId,
    metricType: "latency",
    threshold: 500,
    windowMinutes: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRepo(): {
  [K in keyof SlaRepository]: ReturnType<typeof vi.fn>;
} {
  return {
    createRule: vi.fn(),
    listRules: vi.fn().mockResolvedValue([]),
    deleteRule: vi.fn(),
    recordCompliance: vi.fn().mockImplementation((data) =>
      Promise.resolve({
        id: "comp-1",
        ruleId: data.ruleId,
        agentId: data.agentId,
        status: data.status,
        currentValue: data.currentValue,
        threshold: data.threshold,
        evaluatedAt: new Date().toISOString(),
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
      } satisfies SlaComplianceRecord)
    ),
    listComplianceRecords: vi.fn().mockResolvedValue([]),
    getLatencyStats: vi.fn().mockResolvedValue({ avgLatencyMs: 0, p95LatencyMs: 0, taskCount: 0 }),
    getErrorRate: vi.fn().mockResolvedValue({ errorRate: 0, totalTasks: 0, failedTasks: 0 }),
  };
}

// --- Tests ---

describe("SlaService.evaluateRules", () => {
  // ---- determineStatus boundary values (tested through evaluateRules) ----

  it("returns 'violated' when value exceeds threshold", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([makeRule({ threshold: 500 })]);
    repo.getLatencyStats.mockResolvedValue({ avgLatencyMs: 600, p95LatencyMs: 700, taskCount: 10 });

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("violated");
    expect(records[0].currentValue).toBe(600);
  });

  it("returns 'warning' when value is above 80% of threshold but at or below threshold", async () => {
    const repo = makeRepo();
    // threshold=500 → 80% boundary = 400. Value 450 is in (400, 500] → warning
    repo.listRules.mockResolvedValue([makeRule({ threshold: 500 })]);
    repo.getLatencyStats.mockResolvedValue({ avgLatencyMs: 450, p95LatencyMs: 500, taskCount: 10 });

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("warning");
  });

  it("returns 'compliant' when value is at or below 80% of threshold", async () => {
    const repo = makeRepo();
    // threshold=500 → 80% = 400. Value 300 ≤ 400 → compliant
    repo.listRules.mockResolvedValue([makeRule({ threshold: 500 })]);
    repo.getLatencyStats.mockResolvedValue({ avgLatencyMs: 300, p95LatencyMs: 350, taskCount: 10 });

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("compliant");
  });

  // ---- Metric routing ----

  it("calls getLatencyStats and uses avgLatencyMs for latency rules", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([makeRule({ metricType: "latency", threshold: 1000 })]);
    repo.getLatencyStats.mockResolvedValue({ avgLatencyMs: 250, p95LatencyMs: 400, taskCount: 5 });

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(repo.getLatencyStats).toHaveBeenCalledOnce();
    expect(repo.getErrorRate).not.toHaveBeenCalled();
    expect(records[0].currentValue).toBe(250);
  });

  it("calls getErrorRate and uses errorRate for error_rate rules", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([
      makeRule({ metricType: "error_rate" as SlaMetricType, threshold: 0.1 }),
    ]);
    repo.getErrorRate.mockResolvedValue({ errorRate: 0.05, totalTasks: 100, failedTasks: 5 });

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(repo.getErrorRate).toHaveBeenCalledOnce();
    expect(repo.getLatencyStats).not.toHaveBeenCalled();
    expect(records[0].currentValue).toBe(0.05);
  });

  // ---- Stub metrics (not yet implemented) ----

  it("defaults to compliant with currentValue=0 for uptime rules", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([
      makeRule({ metricType: "uptime" as SlaMetricType, threshold: 0.99 }),
    ]);

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("compliant");
    expect(records[0].currentValue).toBe(0);
    expect(repo.getLatencyStats).not.toHaveBeenCalled();
    expect(repo.getErrorRate).not.toHaveBeenCalled();
  });

  it("defaults to compliant with currentValue=0 for throughput rules", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([
      makeRule({ metricType: "throughput" as SlaMetricType, threshold: 100 }),
    ]);

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe("compliant");
    expect(records[0].currentValue).toBe(0);
  });

  // ---- Edge cases ----

  it("returns empty array when no rules exist", async () => {
    const repo = makeRepo();
    repo.listRules.mockResolvedValue([]);

    const svc = new SlaService(repo as unknown as SlaRepository);
    const records = await svc.evaluateRules(AGENT_ID);

    expect(records).toEqual([]);
    expect(repo.recordCompliance).not.toHaveBeenCalled();
  });

  it("calculates window correctly: windowStart = now - windowMinutes * 60_000", async () => {
    const repo = makeRepo();
    const windowMinutes = 30;
    repo.listRules.mockResolvedValue([makeRule({ metricType: "latency", windowMinutes })]);
    repo.getLatencyStats.mockResolvedValue({ avgLatencyMs: 100, p95LatencyMs: 200, taskCount: 1 });

    const before = Date.now();
    const svc = new SlaService(repo as unknown as SlaRepository);
    await svc.evaluateRules(AGENT_ID);
    const after = Date.now();

    // recordCompliance receives windowStart and windowEnd
    const call = repo.recordCompliance.mock.calls[0][0] as {
      windowStart: string;
      windowEnd: string;
    };

    const windowEnd = new Date(call.windowEnd).getTime();
    const windowStart = new Date(call.windowStart).getTime();
    const expectedDiffMs = windowMinutes * 60_000;

    // windowEnd should be within the test execution window
    expect(windowEnd).toBeGreaterThanOrEqual(before);
    expect(windowEnd).toBeLessThanOrEqual(after);

    // windowStart should be exactly windowMinutes before windowEnd
    expect(windowEnd - windowStart).toBe(expectedDiffMs);
  });
});
