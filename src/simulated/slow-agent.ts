// Simulated agent that adds configurable latency before responding.
// Useful for testing timeouts and SLA monitoring.

import type { AgentId } from "../types/brand.js";
import type {
  InvokeRequest,
  InvokeResponse,
  HealthResponse,
  StreamEvent,
} from "../types/provider-interface.js";
import type { AgentHandler } from "./agent-server.js";

const AGENT_ID = "slow-agent-001" as AgentId;
const startTime = Date.now();

/** Default delay in milliseconds */
const DEFAULT_DELAY_MS = 2000;

function getDelay(): number {
  const envDelay = process.env.SLOW_AGENT_DELAY_MS;
  return envDelay ? parseInt(envDelay, 10) : DEFAULT_DELAY_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleInvoke(req: InvokeRequest): Promise<InvokeResponse> {
  const start = Date.now();
  const delay = getDelay();
  await sleep(delay);
  return {
    taskId: req.taskId,
    status: "success",
    output: { echo: req.input, delayMs: delay },
    durationMs: Date.now() - start,
    usage: { inputTokens: 10, outputTokens: 10 },
  };
}

export function handleHealth(): HealthResponse {
  return {
    status: "healthy",
    agentId: AGENT_ID,
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: [
      { name: "memory", status: "pass" },
      { name: "latency-sim", status: "pass", message: `${getDelay()}ms delay` },
    ],
  };
}

export async function handleStream(req: InvokeRequest): Promise<StreamEvent[]> {
  const delay = getDelay();
  // Split the delay across the stream events
  const chunkDelay = Math.floor(delay / 3);

  await sleep(chunkDelay);
  const now = new Date().toISOString();
  const events: StreamEvent[] = [
    { type: "stream_start", taskId: req.taskId, timestamp: now },
  ];

  await sleep(chunkDelay);
  events.push({
    type: "stream_delta",
    taskId: req.taskId,
    delta: { chunk: "slow-echo:" },
    index: 0,
  });

  await sleep(chunkDelay);
  events.push(
    {
      type: "stream_delta",
      taskId: req.taskId,
      delta: { chunk: req.input },
      index: 1,
    },
    {
      type: "stream_end",
      taskId: req.taskId,
      output: { echo: req.input, delayMs: delay },
      durationMs: delay,
    },
  );

  return events;
}

/** AgentHandler-compatible export for use with createAgentServer */
export const handler: AgentHandler = {
  invoke: handleInvoke,
  health: handleHealth,
  stream: handleStream,
};
