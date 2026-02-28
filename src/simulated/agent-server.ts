// Reusable Fastify server factory that wraps any AgentHandler into HTTP endpoints.
// Keeps agent logic decoupled from HTTP plumbing.

import Fastify, { type FastifyInstance } from "fastify";
import type {
  InvokeRequest,
  InvokeResponse,
  HealthResponse,
  StreamEvent,
} from "../types/provider-interface.js";

/** The contract that simulated agents must implement */
export interface AgentHandler {
  invoke(req: InvokeRequest): InvokeResponse | Promise<InvokeResponse>;
  health(): HealthResponse;
  /** Optional streaming support */
  stream?: (req: InvokeRequest) => StreamEvent[] | Promise<StreamEvent[]>;
}

export interface AgentServerOptions {
  port: number;
  handler: AgentHandler;
  host?: string;
}

export async function createAgentServer(
  opts: AgentServerOptions,
): Promise<FastifyInstance> {
  const { port, handler, host = "127.0.0.1" } = opts;

  const app = Fastify({ logger: false });

  // POST /invoke — synchronous request/response
  app.post<{ Body: InvokeRequest }>("/invoke", async (request, reply) => {
    const result = await handler.invoke(request.body);
    return reply.status(result.status === "error" ? 500 : 200).send(result);
  });

  // GET /health
  app.get("/health", async (_request, reply) => {
    const result = handler.health();
    const code = result.status === "healthy" ? 200 : 503;
    return reply.status(code).send(result);
  });

  // POST /invoke/stream — returns array of SSE events (simplified for testing)
  if (handler.stream) {
    const streamFn = handler.stream;
    app.post<{ Body: InvokeRequest }>("/invoke/stream", async (request, reply) => {
      const events = await streamFn(request.body);
      return reply.status(200).send(events);
    });
  }

  await app.listen({ port, host });
  return app;
}
