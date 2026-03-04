// REST routes for the pipeline engine

import type { FastifyInstance } from "fastify";
import type { ConsumerId, PipelineId, PipelineExecutionId } from "../types/brand.js";
import { PipelineService } from "./service.js";
import { ServiceError } from "../coordination/service.js";
import { requireConsumer } from "../auth/guards.js";

export function registerPipelineRoutes(
  app: FastifyInstance,
  service: PipelineService
): void {
  // Create a pipeline
  app.post("/api/pipelines", async (req, reply) => {
    if (requireConsumer(req, reply)) return;
    const body = req.body as { name: string; description?: string; steps: unknown[]; priority?: string; metadata?: Record<string, string> };
    try {
      const pipeline = await service.createPipeline({
        consumerId: req.identity!.id as ConsumerId,
        name: body.name,
        description: body.description,
        steps: body.steps as never,
        priority: body.priority as never,
        metadata: body.metadata,
      });
      return reply.status(201).send({ data: pipeline });
    } catch (err) {
      if (err instanceof ServiceError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message, retryable: false },
        });
      }
      throw err;
    }
  });

  // List pipelines for the authenticated consumer
  app.get("/api/pipelines", async (req, reply) => {
    if (requireConsumer(req, reply)) return;
    const pipelines = await service.listPipelines(req.identity!.id as ConsumerId);
    return { data: { pipelines } };
  });

  // Get a pipeline by ID
  app.get("/api/pipelines/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pipeline = await service.getPipeline(id as PipelineId);
    if (!pipeline) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Pipeline not found", retryable: false },
      });
    }
    return { data: pipeline };
  });

  // Delete a pipeline (owner only)
  app.delete("/api/pipelines/:id", async (req, reply) => {
    if (requireConsumer(req, reply)) return;
    const { id } = req.params as { id: string };
    const pipeline = await service.getPipeline(id as PipelineId);
    if (!pipeline) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Pipeline not found", retryable: false },
      });
    }
    if (pipeline.consumerId !== req.identity!.id) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Not the owner of this pipeline", retryable: false },
      });
    }
    await service.deletePipeline(id as PipelineId);
    return reply.status(204).send();
  });

  // Execute a pipeline
  app.post("/api/pipelines/:id/execute", async (req, reply) => {
    if (requireConsumer(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = req.body as { input: unknown; metadata?: Record<string, string> } | null;
    try {
      const execution = await service.execute(
        id as PipelineId,
        req.identity!.id as ConsumerId,
        body?.input,
        body?.metadata,
      );
      return reply.status(202).send({ data: execution });
    } catch (err) {
      if (err instanceof ServiceError) {
        const status = err.code === "FORBIDDEN" ? 403 : 400;
        return reply.status(status).send({
          error: { code: err.code, message: err.message, retryable: false },
        });
      }
      throw err;
    }
  });

  // Get execution status
  app.get("/api/pipeline-executions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const exec = await service.getExecution(id as PipelineExecutionId);
    if (!exec) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Execution not found", retryable: false },
      });
    }
    return { data: exec };
  });

  // List executions for a pipeline
  app.get("/api/pipelines/:id/executions", async (req) => {
    const { id } = req.params as { id: string };
    const executions = await service.listExecutions(id as PipelineId);
    return { data: { executions } };
  });

  // List events for an execution
  app.get("/api/pipeline-executions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const events = await service.listEvents(id as PipelineExecutionId);
    return { data: { events } };
  });
}
