import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent } from "../test/helpers.js";
import { CoordinationRepository } from "./repository.js";
import type { CoordinationId, TaskId, AgentId, ConsumerId, TraceId } from "../types/brand.js";

describe("CoordinationRepository", () => {
  const pool = getTestPool();
  const repo = new CoordinationRepository(pool, undefined);

  // Shared entities created fresh each run
  let consumerId: ConsumerId;
  let agentId: AgentId;

  beforeEach(async () => {
    await truncateAll(pool);
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const agent = await createTestAgent(pool, provider.id);
    consumerId = consumer.id;
    agentId = agent.id;
  });

  // Helper: create a coordination + task pair using the shared entities
  async function seedCoordinationAndTask(input?: unknown) {
    const coord = await repo.createCoordination({
      consumerId,
      agentId,
      priority: "normal",
      metadata: {},
    });

    const task = await repo.createTask({
      coordinationId: coord.id,
      agentId,
      consumerId,
      traceId: coord.traceId,
      priority: "normal",
      input: input ?? { hello: "world" },
      maxAttempts: 3,
      timeoutMs: 30_000,
      metadata: {},
    });

    return { coord, task };
  }

  // --- createCoordination ---

  it("createCoordination returns id and auto-generated traceId", async () => {
    const result = await repo.createCoordination({
      consumerId,
      agentId,
      priority: "high",
      metadata: { source: "test" },
    });

    expect(result.id).toBeDefined();
    expect(result.traceId).toBeDefined();
    // Both should be UUID-shaped strings
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.id).toMatch(uuidRe);
    expect(result.traceId).toMatch(uuidRe);
  });

  // --- createTask ---

  it("createTask returns a full Task object", async () => {
    const { task } = await seedCoordinationAndTask({ key: "value" });

    expect(task.id).toBeDefined();
    expect(task.status).toBe("pending");
    expect(task.priority).toBe("normal");
    expect(task.input).toEqual({ key: "value" });
    expect(task.attemptCount).toBe(0);
    expect(task.maxAttempts).toBe(3);
    expect(task.timeoutMs).toBe(30_000);
    expect(task.createdAt).toBeDefined();
    expect(task.startedAt).toBeUndefined();
    expect(task.completedAt).toBeUndefined();
    expect(task.output).toBeUndefined();
    expect(task.error).toBeUndefined();
  });

  // --- getTask ---

  it("getTask returns null for missing task", async () => {
    const result = await repo.getTask("00000000-0000-0000-0000-000000000000" as TaskId);
    expect(result).toBeNull();
  });

  it("getTask returns the created task", async () => {
    const { task } = await seedCoordinationAndTask();
    const fetched = await repo.getTask(task.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(task.id);
    expect(fetched!.status).toBe("pending");
    expect(fetched!.input).toEqual({ hello: "world" });
  });

  // --- updateTask ---

  it("updateTask partial update changes status", async () => {
    const { task } = await seedCoordinationAndTask();
    const updated = await repo.updateTask(task.id, { status: "in_progress" });

    expect(updated.status).toBe("in_progress");
    expect(updated.id).toBe(task.id);
    // Other fields unchanged
    expect(updated.input).toEqual(task.input);
  });

  it("updateTask with JSONB output", async () => {
    const { task } = await seedCoordinationAndTask();
    const output = { result: [1, 2, 3], nested: { ok: true } };
    const updated = await repo.updateTask(task.id, {
      status: "completed",
      output,
      completedAt: new Date().toISOString(),
    });

    expect(updated.status).toBe("completed");
    expect(updated.output).toEqual(output);
    expect(updated.completedAt).toBeDefined();
  });

  // --- listTasks ---

  it("listTasks returns tasks in descending created_at order", async () => {
    // Create three tasks with slight time gaps
    const { coord } = await seedCoordinationAndTask({ seq: 1 });
    const task2 = await repo.createTask({
      coordinationId: coord.id,
      agentId,
      consumerId,
      traceId: coord.traceId,
      priority: "normal",
      input: { seq: 2 },
      maxAttempts: 3,
      timeoutMs: 30_000,
      metadata: {},
    });
    const task3 = await repo.createTask({
      coordinationId: coord.id,
      agentId,
      consumerId,
      traceId: coord.traceId,
      priority: "normal",
      input: { seq: 3 },
      maxAttempts: 3,
      timeoutMs: 30_000,
      metadata: {},
    });

    const result = await repo.listTasks({ limit: 10 });

    expect(result.items.length).toBe(3);
    // Most recent first
    expect(result.items[0].id).toBe(task3.id);
    expect(result.items[1].id).toBe(task2.id);
    expect(result.pagination.hasMore).toBe(false);
  });

  it("listTasks filters by status", async () => {
    const { task } = await seedCoordinationAndTask();
    await repo.updateTask(task.id, { status: "in_progress" });

    // Create a second task that stays pending
    const coord2 = await repo.createCoordination({
      consumerId,
      agentId,
      priority: "normal",
      metadata: {},
    });
    await repo.createTask({
      coordinationId: coord2.id,
      agentId,
      consumerId,
      traceId: coord2.traceId,
      priority: "normal",
      input: {},
      maxAttempts: 1,
      timeoutMs: 5_000,
      metadata: {},
    });

    const pending = await repo.listTasks({ limit: 10 }, { status: "pending" });
    expect(pending.items.length).toBe(1);

    const inProgress = await repo.listTasks({ limit: 10 }, { status: "in_progress" });
    expect(inProgress.items.length).toBe(1);
    expect(inProgress.items[0].id).toBe(task.id);
  });

  it("listTasks filters by agentId", async () => {
    // Seed a task with the default agent
    await seedCoordinationAndTask();

    // Create a second agent and seed a task for it
    const provider2 = await createTestProvider(pool, { name: "provider-2" });
    const agent2 = await createTestAgent(pool, provider2.id, { name: "agent-2" });

    const coord2 = await repo.createCoordination({
      consumerId,
      agentId: agent2.id,
      priority: "normal",
      metadata: {},
    });
    const task2 = await repo.createTask({
      coordinationId: coord2.id,
      agentId: agent2.id,
      consumerId,
      traceId: coord2.traceId,
      priority: "normal",
      input: { from: "agent2" },
      maxAttempts: 1,
      timeoutMs: 5_000,
      metadata: {},
    });

    const filtered = await repo.listTasks({ limit: 10 }, { agentId: agent2.id });
    expect(filtered.items.length).toBe(1);
    expect(filtered.items[0].id).toBe(task2.id);
  });

  // --- emitEvent ---

  it("emitEvent stores event with JSONB payload", async () => {
    const { coord, task } = await seedCoordinationAndTask();

    await repo.emitEvent(coord.id, coord.traceId, {
      type: "task_created",
      taskId: task.id,
    });

    const events = await repo.listEvents(coord.id, { limit: 10 });
    expect(events.items.length).toBe(1);
    expect(events.items[0].coordinationId).toBe(coord.id);
    expect(events.items[0].traceId).toBe(coord.traceId);
    expect(events.items[0].payload).toEqual({
      type: "task_created",
      taskId: task.id,
    });
    expect(events.items[0].timestamp).toBeDefined();
  });

  // --- listEvents ---

  it("listEvents returns events in descending order with integer cursor", async () => {
    const { coord, task } = await seedCoordinationAndTask();

    // Emit three events
    await repo.emitEvent(coord.id, coord.traceId, {
      type: "task_created",
      taskId: task.id,
    });
    await repo.emitEvent(coord.id, coord.traceId, {
      type: "task_started",
      taskId: task.id,
      attemptNumber: 1,
    });
    await repo.emitEvent(coord.id, coord.traceId, {
      type: "task_completed",
      taskId: task.id,
      output: { done: true },
    });

    const result = await repo.listEvents(coord.id, { limit: 10 });

    expect(result.items.length).toBe(3);
    // Most recent first
    expect(result.items[0].payload.type).toBe("task_completed");
    expect(result.items[1].payload.type).toBe("task_started");
    expect(result.items[2].payload.type).toBe("task_created");
    expect(result.pagination.hasMore).toBe(false);
  });

  it("listEvents pagination works", async () => {
    const { coord, task } = await seedCoordinationAndTask();

    // Emit 5 events
    for (let i = 1; i <= 5; i++) {
      await repo.emitEvent(coord.id, coord.traceId, {
        type: "task_started",
        taskId: task.id,
        attemptNumber: i,
      });
    }

    // First page: limit 2
    const page1 = await repo.listEvents(coord.id, { limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBeDefined();

    // Second page using cursor
    const page2 = await repo.listEvents(coord.id, {
      limit: 2,
      cursor: page1.pagination.nextCursor,
    });
    expect(page2.items.length).toBe(2);
    expect(page2.pagination.hasMore).toBe(true);

    // Third page — should have 1 remaining
    const page3 = await repo.listEvents(coord.id, {
      limit: 2,
      cursor: page2.pagination.nextCursor,
    });
    expect(page3.items.length).toBe(1);
    expect(page3.pagination.hasMore).toBe(false);

    // Total across all pages should be 5
    const totalItems = page1.items.length + page2.items.length + page3.items.length;
    expect(totalItems).toBe(5);
  });
});
