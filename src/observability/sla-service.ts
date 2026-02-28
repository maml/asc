// SLA service — evaluates SLA rules and records compliance

import type { SlaRule, SlaComplianceRecord, ComplianceStatus } from "../types/sla.js";
import type { SlaRepository } from "./sla-repo.js";

export class SlaService {
  constructor(private repo: SlaRepository) {}

  async createRule(data: Parameters<SlaRepository["createRule"]>[0]): Promise<SlaRule> {
    return this.repo.createRule(data);
  }

  async listRules(opts?: Parameters<SlaRepository["listRules"]>[0]): Promise<SlaRule[]> {
    return this.repo.listRules(opts);
  }

  async deleteRule(id: string): Promise<void> {
    return this.repo.deleteRule(id);
  }

  async evaluateRules(agentId: string): Promise<SlaComplianceRecord[]> {
    const rules = await this.repo.listRules({ agentId });
    const records: SlaComplianceRecord[] = [];

    for (const rule of rules) {
      const now = new Date();
      const windowEnd = now.toISOString();
      const windowStart = new Date(now.getTime() - rule.windowMinutes * 60_000).toISOString();

      let currentValue: number;
      let status: ComplianceStatus;

      switch (rule.metricType) {
        case "latency": {
          const stats = await this.repo.getLatencyStats(agentId, windowStart, windowEnd);
          currentValue = stats.avgLatencyMs;
          status = determineStatus(currentValue, rule.threshold);
          break;
        }
        case "error_rate": {
          const stats = await this.repo.getErrorRate(agentId, windowStart, windowEnd);
          currentValue = stats.errorRate;
          status = determineStatus(currentValue, rule.threshold);
          break;
        }
        case "uptime":
        case "throughput": {
          // Not yet implemented — default to compliant
          currentValue = 0;
          status = "compliant";
          break;
        }
      }

      const record = await this.repo.recordCompliance({
        ruleId: rule.id,
        agentId,
        status,
        currentValue,
        threshold: rule.threshold,
        windowStart,
        windowEnd,
      });

      records.push(record);
    }

    return records;
  }

  async listComplianceRecords(
    opts: Parameters<SlaRepository["listComplianceRecords"]>[0]
  ): Promise<SlaComplianceRecord[]> {
    return this.repo.listComplianceRecords(opts);
  }
}

// Threshold comparison: value exceeding threshold means violation
function determineStatus(value: number, threshold: number): ComplianceStatus {
  if (value > threshold) return "violated";
  if (value > threshold * 0.8) return "warning";
  return "compliant";
}
