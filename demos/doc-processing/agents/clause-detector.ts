// Identifies contractual clauses from extracted text.

import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse } from "../../../src/types/provider-interface.js";

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

interface ExtractedParagraph {
  paragraphIndex: number;
  text: string;
  confidence: number;
}

// Clause type detection based on keyword matching
const CLAUSE_PATTERNS: Array<{ type: string; keywords: string[]; severity: string }> = [
  { type: "confidentiality", keywords: ["confidential", "non-disclosure", "nda"], severity: "standard" },
  { type: "non-solicitation", keywords: ["non-solicitation", "solicit", "employee"], severity: "moderate" },
  { type: "time-period", keywords: ["term", "period", "years", "termination"], severity: "standard" },
  { type: "remedies", keywords: ["remedies", "injunctive", "breach", "liability"], severity: "high" },
  { type: "governing-law", keywords: ["governing law", "jurisdiction", "courts"], severity: "standard" },
  { type: "definition", keywords: ["definition", "means", "defined as"], severity: "low" },
];

export async function invoke(req: InvokeRequest): Promise<InvokeResponse> {
  const start = Date.now();
  await delay(500, 900);

  const input = req.input as { extractedParagraphs?: ExtractedParagraph[] };
  const paragraphs = input.extractedParagraphs ?? [];

  const clauses = paragraphs
    .map((p) => {
      const textLower = p.text.toLowerCase();
      const match = CLAUSE_PATTERNS.find((cp) =>
        cp.keywords.some((kw) => textLower.includes(kw)),
      );
      if (!match) return null;
      return {
        clauseType: match.type,
        severity: match.severity,
        paragraphIndex: p.paragraphIndex,
        excerpt: p.text.slice(0, 150) + (p.text.length > 150 ? "..." : ""),
        confidence: 0.85 + Math.random() * 0.15,
      };
    })
    .filter(Boolean);

  return {
    taskId: req.taskId,
    status: "success",
    output: {
      clauseCount: clauses.length,
      clauses,
      engine: "DocAI-ClauseDetect v2.4",
    },
    durationMs: Date.now() - start,
    usage: { computeMs: Date.now() - start },
  };
}

export function agentId(): AgentId {
  return "clause-detector" as AgentId;
}
