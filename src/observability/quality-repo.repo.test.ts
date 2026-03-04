import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain } from "../test/helpers.js";
import { QualityGateRepository } from "./quality-repo.js";

const pool = getTestPool();
const repo = new QualityGateRepository(pool);

describe("QualityGateRepository", () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it("createGate stores and returns gate with JSONB checkConfig", async () => {
    const { agent } = await createFullEntityChain(pool);
    const checkConfig = { type: "latency_threshold", maxMs: 5000 };

    const gate = await repo.createGate({
      agentId: agent.id,
      name: "Latency gate",
      description: "Fails if latency exceeds 5s",
      checkConfig,
      required: true,
    });

    expect(gate.id).toBeDefined();
    expect(gate.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(gate.agentId).toBe(agent.id);
    expect(gate.name).toBe("Latency gate");
    expect(gate.description).toBe("Fails if latency exceeds 5s");
    expect(gate.check).toEqual(checkConfig);
    expect(gate.required).toBe(true);
    expect(gate.createdAt).toBeDefined();
  });

  it("listGates filters by agentId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);

    await repo.createGate({
      agentId: chain1.agent.id,
      name: "Gate for agent 1",
      checkConfig: { type: "latency_threshold", maxMs: 3000 },
    });
    await repo.createGate({
      agentId: chain2.agent.id,
      name: "Gate for agent 2",
      checkConfig: { type: "latency_threshold", maxMs: 4000 },
    });

    const gates = await repo.listGates({ agentId: chain1.agent.id });

    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe("Gate for agent 1");
    expect(gates[0].agentId).toBe(chain1.agent.id);
  });

  it("deleteGate removes gate", async () => {
    const { agent } = await createFullEntityChain(pool);
    const gate = await repo.createGate({
      agentId: agent.id,
      name: "Ephemeral gate",
      checkConfig: { type: "accuracy_threshold", minScore: 0.95 },
    });

    await repo.deleteGate(gate.id);

    const found = await repo.getGate(gate.id);
    expect(found).toBeNull();
  });

  it("recordCheck stores and returns check record", async () => {
    const { agent, taskId } = await createFullEntityChain(pool);
    const gate = await repo.createGate({
      agentId: agent.id,
      name: "Latency gate",
      checkConfig: { type: "latency_threshold", maxMs: 5000 },
    });

    const record = await repo.recordCheck({
      gateId: gate.id,
      taskId,
      result: "pass",
      message: "Latency within threshold",
      durationMs: 1200,
    });

    expect(record.gateId).toBe(gate.id);
    expect(record.result).toBe("pass");
    expect(record.message).toBe("Latency within threshold");
    expect(record.durationMs).toBe(1200);
    expect(record.checkedAt).toBeDefined();
  });

  it("listCheckRecords filters by gateId", async () => {
    const { agent, taskId } = await createFullEntityChain(pool);
    const gate1 = await repo.createGate({
      agentId: agent.id,
      name: "Gate A",
      checkConfig: { type: "latency_threshold", maxMs: 3000 },
    });
    const gate2 = await repo.createGate({
      agentId: agent.id,
      name: "Gate B",
      checkConfig: { type: "accuracy_threshold", minScore: 0.9 },
    });

    await repo.recordCheck({ gateId: gate1.id, taskId, result: "pass" });
    await repo.recordCheck({ gateId: gate2.id, taskId, result: "fail", message: "Too slow" });

    const records = await repo.listCheckRecords({ gateId: gate1.id });

    expect(records).toHaveLength(1);
    expect(records[0].gateId).toBe(gate1.id);
    expect(records[0].result).toBe("pass");
  });

  it("listCheckRecords filters by taskId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);
    const gate = await repo.createGate({
      agentId: chain1.agent.id,
      name: "Shared gate",
      checkConfig: { type: "latency_threshold", maxMs: 5000 },
    });

    await repo.recordCheck({ gateId: gate.id, taskId: chain1.taskId, result: "pass" });
    await repo.recordCheck({ gateId: gate.id, taskId: chain2.taskId, result: "fail" });

    const records = await repo.listCheckRecords({ taskId: chain1.taskId });

    expect(records).toHaveLength(1);
    expect(records[0].result).toBe("pass");
  });
});
