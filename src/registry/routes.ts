// REST API routes — thin layer that maps HTTP to RegistryService calls

import type { FastifyInstance } from "fastify";
import type { ProviderId, AgentId, ConsumerId } from "../types/brand.js";
import type { RegistryService } from "./service.js";
import { requireProvider, requireConsumer } from "../auth/guards.js";

export function registerRoutes(app: FastifyInstance, service: RegistryService): void {
  // --- Providers ---

  // Public — registration doesn't require auth
  app.post("/api/providers", async (req, reply) => {
    const body = req.body as { name: string; description: string; contactEmail: string; webhookUrl: string; metadata?: Record<string, string> };
    const result = await service.registerProvider(body);
    return reply.status(201).send({ data: result });
  });

  // Any authenticated entity can list/discover providers
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

  // Self-only: provider can only modify itself
  app.patch("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireProvider(req, reply, id as ProviderId)) return;
    try {
      const provider = await service.updateProvider(id as ProviderId, req.body as Record<string, unknown>);
      return { data: provider };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Provider not found", retryable: false } });
    }
  });

  app.delete("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireProvider(req, reply, id as ProviderId)) return;
    await service.deleteProvider(id as ProviderId);
    return reply.status(204).send();
  });

  // --- Consumers ---

  // Public — registration doesn't require auth
  app.post("/api/consumers", async (req, reply) => {
    const body = req.body as { name: string; description: string; contactEmail: string; metadata?: Record<string, string> };
    const result = await service.registerConsumer(body);
    return reply.status(201).send({ data: result });
  });

  // Any authenticated entity can list/discover consumers
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

  // Self-only: consumer can only modify itself
  app.patch("/api/consumers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireConsumer(req, reply, id as ConsumerId)) return;
    try {
      const consumer = await service.updateConsumer(id as ConsumerId, req.body as Record<string, unknown>);
      return { data: consumer };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Consumer not found", retryable: false } });
    }
  });

  app.delete("/api/consumers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireConsumer(req, reply, id as ConsumerId)) return;
    await service.deleteConsumer(id as ConsumerId);
    return reply.status(204).send();
  });

  // --- Agents ---

  // Provider can only create agents under itself
  app.post("/api/providers/:providerId/agents", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    if (requireProvider(req, reply, providerId as ProviderId)) return;
    const body = req.body as Parameters<typeof service.registerAgent>[1];
    const agent = await service.registerAgent(providerId as ProviderId, body);
    return reply.status(201).send({ data: { agent } });
  });

  // Any authenticated entity can discover agents
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

  // Provider can only modify its own agents
  app.patch("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireProvider(req, reply)) return;
    const agent = await service.getAgent(id as AgentId);
    if (!agent) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Agent not found", retryable: false } });
    if (agent.providerId !== req.identity!.id) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Access denied to this resource", retryable: false } });
    }
    try {
      const updated = await service.updateAgent(id as AgentId, req.body as Record<string, unknown>);
      return { data: updated };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Agent not found", retryable: false } });
    }
  });

  app.delete("/api/agents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (requireProvider(req, reply)) return;
    const agent = await service.getAgent(id as AgentId);
    if (!agent) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Agent not found", retryable: false } });
    if (agent.providerId !== req.identity!.id) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Access denied to this resource", retryable: false } });
    }
    await service.deleteAgent(id as AgentId);
    return reply.status(204).send();
  });
}
