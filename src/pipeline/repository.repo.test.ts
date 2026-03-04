import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, createTestAgent } from "../test/helpers.js";
import { PipelineRepository } from "./repository.js";
import type { AgentId, ConsumerId, PipelineId, PipelineExecutionId } from "../types/brand.js";

describe("PipelineRepository", () => {
  const pool = getTestPool();
  const repo = new PipelineRepository(pool);

  let consumerId: ConsumerId;
  let agentId1: AgentId;
  let agentId2: AgentId;

  beforeEach(async () => {
    await truncateAll(pool);
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    consumerId = consumer.id;
    const agent1 = await createTestAgent(pool, provider.id, { name: "agent-1" });
    const agent2 = await createTestAgent(pool, provider.id, { name: "agent-2" });
    agentId1 = agent1.id;
    agentId2 = agent2.id;
  });

  // --- createPipeline ---

  it("creates and retrieves a pipeline", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "A test pipeline with 2 steps",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: { env: "test" },
    });

    expect(pipeline.id).toBeDefined();
    expect(pipeline.consumerId).toBe(consumerId);
    expect(pipeline.name).toBe("test-pipeline");
    expect(pipeline.description).toBe("A test pipeline with 2 steps");
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0]).toEqual({ name: "step-1", agentId: agentId1 });
    expect(pipeline.steps[1]).toEqual({ name: "step-2", agentId: agentId2 });
    expect(pipeline.priority).toBe("normal");
    expect(pipeline.metadata).toEqual({ env: "test" });
    expect(pipeline.createdAt).toBeDefined();

    // Retrieve by ID
    const retrieved = await repo.getPipeline(pipeline.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(pipeline.id);
    expect(retrieved!.name).toBe(pipeline.name);
    expect(retrieved!.steps).toEqual(pipeline.steps);
  });

  // --- listPipelines ---

  it("lists pipelines for a consumer", async () => {
    const pipeline1 = await repo.createPipeline({
      consumerId,
      name: "pipeline-1",
      description: "First pipeline",
      steps: [{ name: "step-1", agentId: agentId1 }],
      priority: "normal",
      metadata: {},
    });

    // Small delay to ensure different created_at timestamps
    await new Promise((r) => setTimeout(r, 10));

    const pipeline2 = await repo.createPipeline({
      consumerId,
      name: "pipeline-2",
      description: "Second pipeline",
      steps: [{ name: "step-1", agentId: agentId2 }],
      priority: "high",
      metadata: {},
    });

    const listed = await repo.listPipelines(consumerId);
    expect(listed).toHaveLength(2);
    // Should be ordered by created_at DESC (most recent first)
    expect(listed[0].id).toBe(pipeline2.id);
    expect(listed[1].id).toBe(pipeline1.id);
  });

  // --- deletePipeline ---

  it("deletes a pipeline", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "to-delete",
      description: "Pipeline to delete",
      steps: [{ name: "step-1", agentId: agentId1 }],
      priority: "normal",
      metadata: {},
    });

    const deleted = await repo.deletePipeline(pipeline.id);
    expect(deleted).toBe(true);

    const retrieved = await repo.getPipeline(pipeline.id);
    expect(retrieved).toBeNull();

    // Delete again returns false
    const deletedAgain = await repo.deletePipeline(pipeline.id);
    expect(deletedAgain).toBe(false);
  });

  // --- createExecution ---

  it("creates execution with step rows atomically", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const { execution, steps } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    // Verify execution fields
    expect(execution.id).toBeDefined();
    expect(execution.pipelineId).toBe(pipeline.id);
    expect(execution.consumerId).toBe(consumerId);
    expect(execution.status).toBe("pending");
    expect(execution.input).toEqual({ text: "hello" });
    expect(execution.output).toBeUndefined();
    expect(execution.error).toBeUndefined();
    expect(execution.currentStepIndex).toBe(0);
    expect(execution.totalSteps).toBe(2);
    expect(execution.createdAt).toBeDefined();
    expect(execution.startedAt).toBeUndefined();
    expect(execution.completedAt).toBeUndefined();

    // Verify step rows
    expect(steps).toHaveLength(2);
    expect(steps[0].executionId).toBe(execution.id);
    expect(steps[0].stepIndex).toBe(0);
    expect(steps[0].stepName).toBe("step-1");
    expect(steps[0].agentId).toBe(agentId1);
    expect(steps[0].status).toBe("pending");
    expect(steps[0].input).toBeUndefined();
    expect(steps[0].output).toBeUndefined();

    expect(steps[1].executionId).toBe(execution.id);
    expect(steps[1].stepIndex).toBe(1);
    expect(steps[1].stepName).toBe("step-2");
    expect(steps[1].agentId).toBe(agentId2);
    expect(steps[1].status).toBe("pending");
  });

  // --- updateExecution ---

  it("updates execution status", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const { execution } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    const startTime = new Date().toISOString();
    const updated = await repo.updateExecution(execution.id, {
      status: "running",
      startedAt: startTime,
    });

    expect(updated.id).toBe(execution.id);
    expect(updated.status).toBe("running");
    expect(updated.startedAt).toBe(startTime);
    expect(updated.completedAt).toBeUndefined();
  });

  // --- updateStepExecution ---

  it("updates step execution", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const { execution, steps } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    // Update step 0 to running with input
    const startTime = new Date().toISOString();
    const updated1 = await repo.updateStepExecution(execution.id, 0, {
      status: "running",
      input: { processed: "input" },
      startedAt: startTime,
    });

    expect(updated1.stepIndex).toBe(0);
    expect(updated1.status).toBe("running");
    expect(updated1.input).toEqual({ processed: "input" });
    expect(updated1.startedAt).toBe(startTime);
    expect(updated1.output).toBeUndefined();

    // Update step 0 to completed with output
    const endTime = new Date().toISOString();
    const updated2 = await repo.updateStepExecution(execution.id, 0, {
      status: "completed",
      output: { result: "success" },
      completedAt: endTime,
      durationMs: 1500,
    });

    expect(updated2.status).toBe("completed");
    expect(updated2.output).toEqual({ result: "success" });
    expect(updated2.completedAt).toBe(endTime);
    expect(updated2.durationMs).toBe(1500);
  });

  // --- emitEvent & listEvents ---

  it("emits and lists events", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const { execution } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    // Emit two events
    await repo.emitEvent(execution.id, execution.traceId, {
      type: "pipeline_started",
      executionId: execution.id,
    });

    await repo.emitEvent(execution.id, execution.traceId, {
      type: "pipeline_step_started",
      executionId: execution.id,
      stepIndex: 0,
      stepName: "step-1",
      agentId: agentId1,
    });

    // List events
    const events = await repo.listEvents(execution.id);
    expect(events).toHaveLength(2);

    // Events should be in order (ascending timestamp)
    expect(events[0].payload.type).toBe("pipeline_started");
    expect(events[0].executionId).toBe(execution.id);
    expect(events[0].traceId).toBe(execution.traceId);

    expect(events[1].payload.type).toBe("pipeline_step_started");
    expect(events[1].executionId).toBe(execution.id);
    if (events[1].payload.type === "pipeline_step_started") {
      expect(events[1].payload.stepIndex).toBe(0);
      expect(events[1].payload.stepName).toBe("step-1");
    }
  });

  // --- listExecutions ---

  it("lists executions for a pipeline", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const exec1 = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "input1" },
      steps: pipeline.steps,
      metadata: {},
    });

    // Small delay to ensure different created_at timestamps
    await new Promise((r) => setTimeout(r, 10));

    const exec2 = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "input2" },
      steps: pipeline.steps,
      metadata: {},
    });

    const listed = await repo.listExecutions(pipeline.id);
    expect(listed).toHaveLength(2);
    // Should be ordered by created_at DESC (most recent first)
    expect(listed[0].id).toBe(exec2.execution.id);
    expect(listed[1].id).toBe(exec1.execution.id);
  });

  // --- getExecution ---

  it("gets execution by ID", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [{ name: "step-1", agentId: agentId1 }],
      priority: "normal",
      metadata: {},
    });

    const { execution } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    const retrieved = await repo.getExecution(execution.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(execution.id);
    expect(retrieved!.status).toBe("pending");
    expect(retrieved!.input).toEqual({ text: "hello" });
  });

  it("returns null for missing execution", async () => {
    const result = await repo.getExecution("00000000-0000-0000-0000-000000000000" as PipelineExecutionId);
    expect(result).toBeNull();
  });

  // --- listStepExecutions ---

  it("lists step executions for an execution", async () => {
    const pipeline = await repo.createPipeline({
      consumerId,
      name: "test-pipeline",
      description: "test",
      steps: [
        { name: "step-1", agentId: agentId1 },
        { name: "step-2", agentId: agentId2 },
      ],
      priority: "normal",
      metadata: {},
    });

    const { execution, steps } = await repo.createExecution({
      pipelineId: pipeline.id,
      consumerId,
      input: { text: "hello" },
      steps: pipeline.steps,
      metadata: {},
    });

    const listed = await repo.listStepExecutions(execution.id);
    expect(listed).toHaveLength(2);
    // Should be ordered by step_index ASC
    expect(listed[0].stepIndex).toBe(0);
    expect(listed[0].stepName).toBe("step-1");
    expect(listed[1].stepIndex).toBe(1);
    expect(listed[1].stepName).toBe("step-2");
  });
});
