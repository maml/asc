import { describe, it, expect, vi } from "vitest";
import { QualityService } from "./quality-service.js";
import type { QualityGate, QualityCheckRecord } from "../types/quality.js";
import type { QualityGateId, AgentId } from "../types/brand.js";

// --- Helpers ---

function makeGate(overrides: Partial<QualityGate> & Pick<QualityGate, "check">): QualityGate {
  return {
    id: "gate-1" as QualityGateId,
    agentId: "agent-1" as AgentId,
    name: "Test Gate",
    description: "",
    required: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockRepo(gates: QualityGate[] = []) {
  return {
    createGate: vi.fn(),
    listGates: vi.fn().mockResolvedValue(gates),
    getGate: vi.fn(),
    deleteGate: vi.fn(),
    recordCheck: vi.fn().mockImplementation((data: {
      gateId: string;
      taskId: string;
      result: string;
      message?: string;
      durationMs?: number;
    }) => Promise.resolve({
      gateId: data.gateId as QualityGateId,
      result: data.result,
      message: data.message,
      durationMs: data.durationMs ?? 0,
      checkedAt: new Date().toISOString(),
    } satisfies QualityCheckRecord)),
    listCheckRecords: vi.fn(),
  };
}

// --- Tests ---

describe("QualityService", () => {
  // ---- json_schema evaluator ----

  describe("json_schema check", () => {
    const gate = makeGate({ check: { type: "json_schema", schema: {} } });

    it("passes when output is an object", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records, passed } = await svc.runChecks("agent-1", "task-1", { foo: "bar" }, 100);
      expect(records).toHaveLength(1);
      expect(records[0].result).toBe("pass");
      expect(passed).toBe(true);
    });

    it("passes when output is a valid JSON string", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", '{"foo":"bar"}', 100);
      expect(records[0].result).toBe("pass");
    });

    it("fails when output is null", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", null, 100);
      expect(records[0].result).toBe("fail");
      expect(records[0].message).toBe("Output is null or undefined");
    });

    it("fails when output is an invalid JSON string", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "not json {", 100);
      expect(records[0].result).toBe("fail");
      expect(records[0].message).toBe("Output is not valid JSON");
    });
  });

  // ---- latency_threshold evaluator ----

  describe("latency_threshold check", () => {
    const gate = makeGate({ check: { type: "latency_threshold", maxMs: 500 } });

    it("passes when durationMs equals maxMs", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "output", 500);
      expect(records[0].result).toBe("pass");
    });

    it("passes when durationMs is below maxMs", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "output", 200);
      expect(records[0].result).toBe("pass");
    });

    it("fails when durationMs exceeds maxMs", async () => {
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "output", 800);
      expect(records[0].result).toBe("fail");
      expect(records[0].message).toBe("Latency 800ms exceeds threshold 500ms");
    });
  });

  // ---- output_regex evaluator ----

  describe("output_regex check", () => {
    it("passes when output matches the pattern", async () => {
      const gate = makeGate({ check: { type: "output_regex", pattern: "^hello" } });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "hello world", 100);
      expect(records[0].result).toBe("pass");
    });

    it("fails when output does not match the pattern", async () => {
      const gate = makeGate({ check: { type: "output_regex", pattern: "^hello" } });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "goodbye world", 100);
      expect(records[0].result).toBe("fail");
      expect(records[0].message).toBe("Output does not match pattern /^hello/");
    });

    it("fails when output is not a string", async () => {
      const gate = makeGate({ check: { type: "output_regex", pattern: ".*" } });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", 42, 100);
      expect(records[0].result).toBe("fail");
      expect(records[0].message).toBe("Output is not a string, cannot test regex");
    });

    it("returns error when regex pattern is invalid", async () => {
      const gate = makeGate({ check: { type: "output_regex", pattern: "[invalid" } });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "test", 100);
      expect(records[0].result).toBe("error");
      expect(records[0].message).toBe("Invalid regex pattern: [invalid");
    });

    it("passes with flags (case insensitive)", async () => {
      const gate = makeGate({ check: { type: "output_regex", pattern: "^hello", flags: "i" } });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "HELLO world", 100);
      expect(records[0].result).toBe("pass");
    });
  });

  // ---- custom_webhook evaluator ----

  describe("custom_webhook check", () => {
    it("returns skip with not-implemented message", async () => {
      const gate = makeGate({
        check: { type: "custom_webhook", url: "https://example.com/hook", timeoutMs: 5000 },
      });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { records } = await svc.runChecks("agent-1", "task-1", "output", 100);
      expect(records[0].result).toBe("skip");
      expect(records[0].message).toBe("Custom webhooks not yet implemented");
    });
  });

  // ---- runChecks logic ----

  describe("runChecks aggregation", () => {
    it("returns passed=false when a required gate fails", async () => {
      const gate = makeGate({
        id: "gate-req" as QualityGateId,
        required: true,
        check: { type: "latency_threshold", maxMs: 100 },
      });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { passed } = await svc.runChecks("agent-1", "task-1", "output", 999);
      expect(passed).toBe(false);
    });

    it("returns passed=true when a non-required gate fails", async () => {
      const gate = makeGate({
        id: "gate-opt" as QualityGateId,
        required: false,
        check: { type: "latency_threshold", maxMs: 100 },
      });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { passed } = await svc.runChecks("agent-1", "task-1", "output", 999);
      expect(passed).toBe(true);
    });

    it("returns passed=true when a required gate skips (skip !== fail)", async () => {
      const gate = makeGate({
        id: "gate-skip" as QualityGateId,
        required: true,
        check: { type: "custom_webhook", url: "https://example.com", timeoutMs: 5000 },
      });
      const repo = makeMockRepo([gate]);
      const svc = new QualityService(repo);
      const { passed } = await svc.runChecks("agent-1", "task-1", "output", 100);
      expect(passed).toBe(true);
    });

    it("returns passed=true when there are no gates", async () => {
      const repo = makeMockRepo([]);
      const svc = new QualityService(repo);
      const { records, passed } = await svc.runChecks("agent-1", "task-1", "output", 100);
      expect(records).toHaveLength(0);
      expect(passed).toBe(true);
    });
  });
});
