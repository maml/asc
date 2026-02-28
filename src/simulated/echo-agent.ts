// Simulated agent that implements the provider interface contract.
// Echoes input back as output — validates the types are implementable in ~50 lines.

import type { AgentId } from "../types/brand.js";
import type {
  InvokeRequest,
  InvokeResponse,
  HealthResponse,
  StreamEvent,
} from "../types/provider-interface.js";
import type { AgentHandler } from "./agent-server.js";

const AGENT_ID = "echo-agent-001" as AgentId;
const startTime = Date.now();

/** POST /invoke — synchronous request/response */
export function handleInvoke(req: InvokeRequest): InvokeResponse {
  const start = Date.now();
  return {
    taskId: req.taskId,
    status: "success",
    output: { echo: req.input },
    durationMs: Date.now() - start,
    usage: { inputTokens: 10, outputTokens: 10 },
  };
}

/** GET /health */
export function handleHealth(): HealthResponse {
  return {
    status: "healthy",
    agentId: AGENT_ID,
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: [{ name: "memory", status: "pass" }],
  };
}

/** POST /invoke/stream — returns an array of SSE events */
export function handleStream(req: InvokeRequest): StreamEvent[] {
  const now = new Date().toISOString();
  return [
    { type: "stream_start", taskId: req.taskId, timestamp: now },
    { type: "stream_delta", taskId: req.taskId, delta: { chunk: "echo:" }, index: 0 },
    { type: "stream_delta", taskId: req.taskId, delta: { chunk: req.input }, index: 1 },
    { type: "stream_end", taskId: req.taskId, output: { echo: req.input }, durationMs: 1 },
  ];
}

/** AgentHandler-compatible export for use with createAgentServer */
export const handler: AgentHandler = {
  invoke: handleInvoke,
  health: handleHealth,
  stream: handleStream,
};
