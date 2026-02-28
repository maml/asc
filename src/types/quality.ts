import type { QualityGateId, AgentId } from "./brand.js";
import type { Timestamp } from "./common.js";

/** Discriminated union — each check type carries its own config */
export type QualityCheckConfig =
  | { type: "json_schema"; schema: Record<string, unknown> }
  | { type: "latency_threshold"; maxMs: number }
  | { type: "output_regex"; pattern: string; flags?: string }
  | { type: "custom_webhook"; url: string; timeoutMs: number };

export interface QualityGate {
  id: QualityGateId;
  agentId: AgentId;
  name: string;
  description: string;
  check: QualityCheckConfig;
  required: boolean; // If true, failing this gate blocks the task
  createdAt: Timestamp;
}

export type QualityCheckResult = "pass" | "fail" | "skip" | "error";

export interface QualityCheckRecord {
  gateId: QualityGateId;
  result: QualityCheckResult;
  message?: string;
  durationMs: number;
  checkedAt: Timestamp;
}
