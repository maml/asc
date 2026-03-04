// OCR simulation — extracts text from a "document" with realistic latency.

import type { AgentId } from "../../../src/types/brand.js";
import type { InvokeRequest, InvokeResponse } from "../../../src/types/provider-interface.js";

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

export async function invoke(req: InvokeRequest): Promise<InvokeResponse> {
  const start = Date.now();
  await delay(800, 1200);

  const input = req.input as { rawText?: string; title?: string };
  const text = input.rawText ?? "";

  // Simulate OCR: break into paragraphs, tag with positions
  const paragraphs = text.split("\n\n").filter(Boolean);
  const extracted = paragraphs.map((p, i) => ({
    paragraphIndex: i,
    text: p.trim(),
    confidence: 0.92 + Math.random() * 0.08, // 92-100%
  }));

  return {
    taskId: req.taskId,
    status: "success",
    output: {
      documentTitle: input.title ?? "Unknown",
      paragraphCount: extracted.length,
      totalCharacters: text.length,
      extractedParagraphs: extracted,
      ocrEngine: "DocAI-TextExtract v3.1",
    },
    durationMs: Date.now() - start,
    usage: { computeMs: Date.now() - start },
  };
}

export function agentId(): AgentId {
  return "text-extractor" as AgentId;
}
