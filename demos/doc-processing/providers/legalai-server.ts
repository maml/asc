// LegalAI Inc provider server — hosts Risk Analyzer + Summary Generator on port 4500.

import Fastify from "fastify";
import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse, HealthResponse } from "../../../src/types/provider-interface.js";
import { invoke as riskAnalyzerInvoke } from "../agents/risk-analyzer.js";
import { invoke as summaryGeneratorInvoke } from "../agents/summary-generator.js";

type AgentInvoker = (req: InvokeRequest) => Promise<InvokeResponse>;

const handlers = new Map<string, AgentInvoker>();

export function registerHandler(agentId: AgentId, handler: AgentInvoker): void {
  handlers.set(agentId, handler);
}

const PORT = 4500;
const startTime = Date.now();

export async function startLegalAIServer(): Promise<ReturnType<typeof Fastify>> {
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
      agentId: "legalai-server" as AgentId,
      version: "1.7.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: [
        { name: "risk-analyzer", status: "pass" },
        { name: "summary-generator", status: "pass" },
      ],
    };
    return reply.status(200).send(resp);
  });

  await app.listen({ port: PORT, host: "127.0.0.1" });
  return app;
}

export function wireDefaultHandlers(riskAnalyzerId: AgentId, summaryGeneratorId: AgentId): void {
  registerHandler(riskAnalyzerId, riskAnalyzerInvoke);
  registerHandler(summaryGeneratorId, summaryGeneratorInvoke);
}
