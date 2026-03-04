// Assembles an executive summary from risk assessments.

import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse } from "../../../src/types/provider-interface.js";

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

interface RiskAssessment {
  clauseType: string;
  riskLevel: string;
  finding: string;
  excerpt: string;
}

export async function invoke(req: InvokeRequest): Promise<InvokeResponse> {
  const start = Date.now();
  await delay(600, 1000);

  const input = req.input as {
    overallRisk?: string;
    highRiskCount?: number;
    mediumRiskCount?: number;
    assessments?: RiskAssessment[];
    documentTitle?: string;
  };

  const assessments = input.assessments ?? [];
  const highRisks = assessments.filter((a) => a.riskLevel === "high");
  const mediumRisks = assessments.filter((a) => a.riskLevel === "medium");

  // Build executive summary
  const lines: string[] = [
    `EXECUTIVE SUMMARY: ${input.documentTitle ?? "Contract Review"}`,
    `${"═".repeat(60)}`,
    "",
    `Overall Risk Level: ${(input.overallRisk ?? "unknown").toUpperCase()}`,
    `Clauses Analyzed: ${assessments.length}`,
    `High Risk Items: ${highRisks.length}`,
    `Medium Risk Items: ${mediumRisks.length}`,
    "",
  ];

  if (highRisks.length > 0) {
    lines.push("⚠ HIGH RISK FINDINGS:");
    for (const r of highRisks) {
      lines.push(`  • [${r.clauseType}] ${r.finding}`);
    }
    lines.push("");
  }

  if (mediumRisks.length > 0) {
    lines.push("△ MEDIUM RISK FINDINGS:");
    for (const r of mediumRisks) {
      lines.push(`  • [${r.clauseType}] ${r.finding}`);
    }
    lines.push("");
  }

  lines.push("RECOMMENDATION:");
  if (highRisks.length > 0) {
    lines.push("  Request amendments to high-risk clauses before signing.");
    lines.push("  Specifically: negotiate a mutual liability cap and add arbitration clause.");
  } else if (mediumRisks.length > 0) {
    lines.push("  Review medium-risk items with counsel. Consider negotiating improvements.");
  } else {
    lines.push("  Contract appears standard. Safe to proceed with signing.");
  }

  return {
    taskId: req.taskId,
    status: "success",
    output: {
      summary: lines.join("\n"),
      recommendAction: highRisks.length > 0 ? "amend" : mediumRisks.length > 0 ? "review" : "sign",
      engine: "LegalAI-Summarizer v2.0",
    },
    durationMs: Date.now() - start,
    usage: { computeMs: Date.now() - start },
  };
}

export function agentId(): AgentId {
  return "summary-generator" as AgentId;
}
