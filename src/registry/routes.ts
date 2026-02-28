// REST API routes — thin layer that maps HTTP to RegistryService calls

import type { FastifyInstance } from "fastify";
import type { ProviderId, AgentId, ConsumerId } from "../types/brand.js";
import type { RegistryService } from "./service.js";

export function registerRoutes(app: FastifyInstance, service: RegistryService): void {
  // --- Providers ---

  app.post("/api/providers", async (req, reply) => {
    const body = req.body as { name: string; description: string; contactEmail: string; webhookUrl: string; metadata?: Record<string, string> };
    const result = await service.registerProvider(body);
    return reply.status(201).send({ data: result });
  });

  app.get("/api/providers", async (req) => {
    const query = req.query as { cursor?: string; limit?: string; status?: string };
    const result = await service.listProviders(
      { cursor: query.cursor, limit: parseInt(query.limit ?? "20", 10) },
      query.status
    );
    return { data: { providers: result.items, pagination: result.pagination } };
  });

  app.get("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const provider = await service.getProvider(id as ProviderId);
    if (!provider) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Provider not found", retryable: false } });
    return { data: provider };
  });

  app.patch("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const provider = await service.updateProvider(id as ProviderId, req.body as Record<string, unknown>);
      return { data: provider };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Provider not found", retryable: false } });
    }
  });

  app.delete("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteProvider(id as ProviderId);
    return reply.status(204).send();
  });

  // --- Consumers ---

  app.post("/api/consumers", async (req, reply) => {
    const body = req.body as { name: string; description: string; contactEmail: string; metadata?: Record<string, string> };
    const result = await service.registerConsumer(body);
    return reply.status(201).send({ data: result });
  });

  app.get("/api/consumers", async (req) => {
    const query = req.query as { cursor?: string; limit?: string; status?: string };
    const result = await service.listConsumers(
      { cursor: query.cursor, limit: parseInt(query.limit ?? "20", 10) },
      query.status
    );
    return { data: { consumers: result.items, pagination: result.pagination } };
  });

  app.get("/api/consumers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const consumer = await service.getConsumer(id as ConsumerId);
    if (!consumer) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Consumer not found", retryable: false } });
    return { data: consumer };
  });

  app.patch("/api/consumers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const consumer = await service.updateConsumer(id as ConsumerId, req.body as Record<string, unknown>);
      return { data: consumer };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Consumer not found", retryable: false } });
    }
  });

  app.delete("/api/consumers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteConsumer(id as ConsumerId);
    return reply.status(204).send();
  });

  // --- Agents ---

  app.post("/api/providers/:providerId/agents", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const body = req.body as Parameters<typeof service.registerAgent>[1];
    const agent = await service.registerAgent(providerId as ProviderId, body);
    return reply.status(201).send({ data: { agent } });
  });

  app.get("/api/agents", async (req) => {
    const query = req.query as { cursor?: string; limit?: string; providerId?: string; status?: string; capability?: string };
    const result = await service.listAgents(
      { cursor: query.cursor, limit: parseInt(query.limit ?? "20", 10) },
      {
        providerId: query.providerId as ProviderId | undefined,
        status: query.status,
        capability: query.capability,
      }
    );
    return { data: { agents: result.items, pagination: result.pagination } };
  });

  app.get("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await service.getAgent(id as AgentId);
    if (!agent) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Agent not found", retryable: false } });
    return { data: agent };
  });

  app.patch("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const agent = await service.updateAgent(id as AgentId, req.body as Record<string, unknown>);
      return { data: agent };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Agent not found", retryable: false } });
    }
  });

  app.delete("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteAgent(id as AgentId);
    return reply.status(204).send();
  });
}
