// REST routes for the coordination engine

import type { FastifyInstance } from "fastify";
import type { AgentId, ConsumerId, TaskId } from "../types/brand.js";
import type { CoordinationRequest } from "../types/coordination.js";
import { CoordinationService, ServiceError } from "./service.js";
import { requireConsumer } from "../auth/guards.js";

export function registerCoordinationRoutes(
  app: FastifyInstance,
  service: CoordinationService
): void {
  // Submit a coordination request — consumer only, derive consumerId from identity
  app.post("/api/coordinations", async (req, reply) => {
    if (requireConsumer(req, reply)) return;
    const body = req.body as Omit<CoordinationRequest, "consumerId"> & { consumerId?: string };
    const request: CoordinationRequest = {
      ...body,
      consumerId: req.identity!.id as ConsumerId,
    };
    try {
      const task = await service.submit(request);
      return reply.status(202).send({ data: { coordinationId: task.coordinationId, task } });
    } catch (err) {
      if (err instanceof ServiceError) {
        return reply.status(400).send({
          error: { code: err.code, message: err.message, retryable: false },
        });
      }
      throw err;
    }
  });

  // Get a task by ID
  app.get("/api/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await service.getTask(id as TaskId);
    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found", retryable: false },
      });
    }
    return { data: task };
  });

  // List tasks
  app.get("/api/tasks", async (req) => {
    const query = req.query as {
      cursor?: string;
      limit?: string;
      consumerId?: string;
      agentId?: string;
      status?: string;
    };
    const result = await service.listTasks(
      { cursor: query.cursor, limit: parseInt(query.limit ?? "20", 10) },
      {
        consumerId: query.consumerId as ConsumerId | undefined,
        agentId: query.agentId as AgentId | undefined,
        status: query.status,
      }
    );
    return { data: { tasks: result.items, pagination: result.pagination } };
  });

  // List events for a coordination
  app.get("/api/coordinations/:id/events", async (req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cursor?: string; limit?: string };
    const result = await service.listEvents(id, {
      cursor: query.cursor,
      limit: parseInt(query.limit ?? "50", 10),
    });
    return { data: { events: result.items, pagination: result.pagination } };
  });
}
