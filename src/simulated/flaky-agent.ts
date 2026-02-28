// Simulated agent that fails randomly based on a configurable failure rate.
// Useful for testing circuit breakers, retries, and error handling.

import type { AgentId } from "../types/brand.js";
import type {
  InvokeRequest,
  InvokeResponse,
  HealthResponse,
  StreamEvent,
} from "../types/provider-interface.js";
import type { AgentHandler } from "./agent-server.js";

const AGENT_ID = "flaky-agent-001" as AgentId;
const startTime = Date.now();

/** Default failure rate: 0.0 to 1.0 */
const DEFAULT_FAILURE_RATE = 0.4;

function getFailureRate(): number {
  const envRate = process.env.FLAKY_AGENT_FAILURE_RATE;
  return envRate ? parseFloat(envRate) : DEFAULT_FAILURE_RATE;
}

function shouldFail(): boolean {
  return Math.random() < getFailureRate();
}

export function handleInvoke(req: InvokeRequest): InvokeResponse {
  const start = Date.now();

  if (shouldFail()) {
    return {
      taskId: req.taskId,
      status: "error",
      error: "Simulated random failure",
      durationMs: Date.now() - start,
    };
  }

  return {
    taskId: req.taskId,
    status: "success",
    output: { echo: req.input },
    durationMs: Date.now() - start,
    usage: { inputTokens: 10, outputTokens: 10 },
  };
}

export function handleHealth(): HealthResponse {
  const rate = getFailureRate();
  // Report degraded if failure rate is high
  const status = rate > 0.5 ? "degraded" : "healthy";
  return {
    status,
    agentId: AGENT_ID,
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: [
      { name: "memory", status: "pass" },
      { name: "reliability", status: rate > 0.5 ? "fail" : "pass", message: `${(rate * 100).toFixed(0)}% failure rate` },
    ],
  };
}

export function handleStream(req: InvokeRequest): StreamEvent[] {
  const now = new Date().toISOString();

  if (shouldFail()) {
    return [
      { type: "stream_start", taskId: req.taskId, timestamp: now },
      { type: "stream_error", taskId: req.taskId, error: "Simulated stream failure" },
    ];
  }

  return [
    { type: "stream_start", taskId: req.taskId, timestamp: now },
    { type: "stream_delta", taskId: req.taskId, delta: { chunk: "flaky-echo:" }, index: 0 },
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
