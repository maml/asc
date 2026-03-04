// Analyzes clauses for risk. Fails 30% of the time to demonstrate retries.

import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse } from "../../../src/types/provider-interface.js";

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

const FAILURE_RATE = 0.3;

interface Clause {
  clauseType: string;
  severity: string;
  paragraphIndex: number;
  excerpt: string;
  confidence: number;
}

// Risk rules keyed by clause type
const RISK_RULES: Record<string, { riskLevel: string; finding: string }> = {
  remedies: {
    riskLevel: "high",
    finding: "Unlimited liability clause with no cap on damages — negotiate a mutual liability cap",
  },
  "non-solicitation": {
    riskLevel: "medium",
    finding: "2-year non-solicitation period exceeds industry standard (typically 12 months)",
  },
  "time-period": {
    riskLevel: "low",
    finding: "5-year term is standard for mutual NDAs — no action required",
  },
  confidentiality: {
    riskLevel: "low",
    finding: "Standard confidentiality provisions — well-drafted",
  },
  "governing-law": {
    riskLevel: "medium",
    finding: "Delaware jurisdiction may create venue inconvenience — consider mutual arbitration clause",
  },
  definition: {
    riskLevel: "low",
    finding: "Broad definition of confidential information — standard for mutual NDAs",
  },
};

export async function invoke(req: InvokeRequest): Promise<InvokeResponse> {
  const start = Date.now();
  await delay(1000, 1500);

  // 30% chance of failure — simulates flaky ML inference
  if (Math.random() < FAILURE_RATE) {
    return {
      taskId: req.taskId,
      status: "error",
      error: "Risk model inference timeout — GPU memory pressure",
      durationMs: Date.now() - start,
    };
  }

  const input = req.input as { clauses?: Clause[] };
  const clauses = input.clauses ?? [];

  const assessments = clauses.map((c) => {
    const rule = RISK_RULES[c.clauseType] ?? {
      riskLevel: "unknown",
      finding: "No risk rule matched — manual review recommended",
    };
    return {
      clauseType: c.clauseType,
      riskLevel: rule.riskLevel,
      finding: rule.finding,
      excerpt: c.excerpt,
    };
  });

  const highRisks = assessments.filter((a) => a.riskLevel === "high").length;
  const mediumRisks = assessments.filter((a) => a.riskLevel === "medium").length;

  return {
    taskId: req.taskId,
    status: "success",
    output: {
      overallRisk: highRisks > 0 ? "high" : mediumRisks > 0 ? "medium" : "low",
      highRiskCount: highRisks,
      mediumRiskCount: mediumRisks,
      assessments,
      engine: "LegalAI-RiskAnalyzer v1.7",
    },
    durationMs: Date.now() - start,
    usage: { computeMs: Date.now() - start },
  };
}

export function agentId(): AgentId {
  return "risk-analyzer" as AgentId;
}
