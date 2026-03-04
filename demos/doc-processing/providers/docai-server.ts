// DocAI Labs provider server — hosts Text Extractor + Clause Detector on port 4400.
// Uses agentId-based dispatch so one server handles multiple agents.

import Fastify from "fastify";
import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse, HealthResponse } from "../../../src/types/provider-interface.js";
import { invoke as textExtractorInvoke } from "../agents/text-extractor.js";
import { invoke as clauseDetectorInvoke } from "../agents/clause-detector.js";

type AgentInvoker = (req: InvokeRequest) => Promise<InvokeResponse>;

// Registered at runtime by seed.ts once agent UUIDs are known
const handlers = new Map<string, AgentInvoker>();

export function registerHandler(agentId: AgentId, handler: AgentInvoker): void {
  handlers.set(agentId, handler);
}

const PORT = 4400;
const startTime = Date.now();

export async function startDocAIServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });

  app.post<{ Body: InvokeRequest }>("/invoke", async (request, reply) => {
    const handler = handlers.get(request.body.agentId);
    if (!handler) {
      return reply.status(404).send({
        taskId: request.body.taskId,
        status: "error",
        error: `Unknown agentId: ${request.body.agentId}`,
        durationMs: 0,
      });
    }
    const result = await handler(request.body);
    return reply.status(result.status === "error" ? 500 : 200).send(result);
  });

  app.get("/health", async (_request, reply) => {
    const resp: HealthResponse = {
      status: "healthy",
      agentId: "docai-server" as AgentId,
      version: "3.1.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: [
        { name: "text-extractor", status: "pass" },
        { name: "clause-detector", status: "pass" },
      ],
    };
    return reply.status(200).send(resp);
  });

  await app.listen({ port: PORT, host: "127.0.0.1" });
  return app;
}

// Pre-register the built-in handlers (will be re-wired by seed with actual UUIDs)
export function wireDefaultHandlers(textExtractorId: AgentId, clauseDetectorId: AgentId): void {
  registerHandler(textExtractorId, textExtractorInvoke);
  registerHandler(clauseDetectorId, clauseDetectorInvoke);
}
