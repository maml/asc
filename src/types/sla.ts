import type { SlaRuleId, AgentId, ProviderId } from "./brand.js";
import type { Timestamp } from "./common.js";

export type SlaMetricType = "latency" | "uptime" | "error_rate" | "throughput";

export interface SlaRule {
  id: SlaRuleId;
  agentId: AgentId;
  providerId: ProviderId;
  metricType: SlaMetricType;
  threshold: number;
  windowMinutes: number; // Rolling window for evaluation
  createdAt: Timestamp;
}

export type ComplianceStatus = "compliant" | "warning" | "violated";

export interface SlaComplianceRecord {
  id: string;
  ruleId: SlaRuleId;
  agentId: AgentId;
  status: ComplianceStatus;
  currentValue: number;
  threshold: number;
  evaluatedAt: Timestamp;
  windowStart: Timestamp;
  windowEnd: Timestamp;
}
