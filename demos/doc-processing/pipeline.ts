// 4-stage sequential coordination pipeline.
// Each stage submits a coordination request and polls until completion.

import type { AgentId, ConsumerId, TaskId } from "../../src/types/brand.js";
import type { SeedResult } from "./seed.js";
import { sampleContract } from "./sample-contract.js";

const ASC = "http://127.0.0.1:3100";
const POLL_INTERVAL_MS = 300;

interface TaskResult {
  status: string;
  output?: unknown;
  error?: string;
  attemptCount: number;
}

async function submitAndPoll(
  consumerId: ConsumerId,
  agentId: AgentId,
  input: unknown,
  stageName: string,
): Promise<{ output: unknown; attempts: number; durationMs: number }> {
  const start = Date.now();

  // Submit coordination
  const res = await fetch(`${ASC}/api/coordinations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consumerId,
      agentId,
      input,
      priority: "high",
      timeoutMs: 15000,
    }),
  });

  if (!res.ok) {
    throw new Error(`Coordination submit failed for ${stageName}: ${res.status} ${await res.text()}`);
  }

  const { data } = (await res.json()) as { data: { task: { id: TaskId } } };
  const taskId = data.task.id;

  // Poll until terminal state
  while (true) {
    const pollRes = await fetch(`${ASC}/api/tasks/${taskId}`);
    if (!pollRes.ok) throw new Error(`Task poll failed: ${pollRes.status}`);

    const { data: task } = (await pollRes.json()) as { data: TaskResult };

    if (task.status === "completed") {
      const durationMs = Date.now() - start;
      return { output: task.output, attempts: task.attemptCount, durationMs };
    }

    if (task.status === "failed") {
      throw new Error(
        `Stage "${stageName}" failed after ${task.attemptCount} attempts: ${task.error}`,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export async function runPipeline(ids: SeedResult): Promise<void> {
  const pipelineStart = Date.now();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  DOCUMENT PROCESSING PIPELINE");
  console.log(`  Contract: "${sampleContract.title}"`);
  console.log(`  Parties: ${sampleContract.parties.join(" ↔ ")}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Stage 1: Text Extraction
  console.log("▸ Stage 1/4: Text Extraction (DocAI Labs)");
  const stage1 = await submitAndPoll(
    ids.consumerId,
    ids.textExtractorId,
    { rawText: sampleContract.rawText, title: sampleContract.title },
    "Text Extraction",
  );
  const extracted = stage1.output as { extractedParagraphs: unknown[]; paragraphCount: number };
  console.log(`  ✓ ${extracted.paragraphCount} paragraphs extracted [${formatMs(stage1.durationMs)}]\n`);

  // Stage 2: Clause Detection
  console.log("▸ Stage 2/4: Clause Detection (DocAI Labs)");
  const stage2 = await submitAndPoll(
    ids.consumerId,
    ids.clauseDetectorId,
    { extractedParagraphs: extracted.extractedParagraphs },
    "Clause Detection",
  );
  const clauses = stage2.output as { clauseCount: number; clauses: unknown[] };
  console.log(`  ✓ ${clauses.clauseCount} clauses identified [${formatMs(stage2.durationMs)}]\n`);

  // Stage 3: Risk Analysis (may retry!)
  console.log("▸ Stage 3/4: Risk Analysis (LegalAI Inc) ← may retry on failure");
  const stage3 = await submitAndPoll(
    ids.consumerId,
    ids.riskAnalyzerId,
    { clauses: clauses.clauses },
    "Risk Analysis",
  );
  const risks = stage3.output as { overallRisk: string; highRiskCount: number; mediumRiskCount: number; assessments: unknown[] };
  if (stage3.attempts > 1) {
    console.log(`  ⟳ Retried ${stage3.attempts - 1} time(s) before succeeding`);
  }
  console.log(`  ✓ Overall risk: ${risks.overallRisk.toUpperCase()} (${risks.highRiskCount} high, ${risks.mediumRiskCount} medium) [${formatMs(stage3.durationMs)}]\n`);

  // Stage 4: Summary Generation
  console.log("▸ Stage 4/4: Summary Generation (LegalAI Inc)");
  const stage4 = await submitAndPoll(
    ids.consumerId,
    ids.summaryGeneratorId,
    { ...risks, documentTitle: sampleContract.title },
    "Summary Generation",
  );
  const summary = stage4.output as { summary: string; recommendAction: string };
  console.log(`  ✓ Summary generated [${formatMs(stage4.durationMs)}]\n`);

  // Print the summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(summary.summary);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Pipeline stats
  const totalMs = Date.now() - pipelineStart;
  const totalCostCents = 3 + 5 + 8 * stage3.attempts + 10;
  console.log("PIPELINE COMPLETE");
  console.log(`  Total time:     ${formatMs(totalMs)}`);
  console.log(`  Stages:         4`);
  console.log(`  Total attempts: ${stage1.attempts + stage2.attempts + stage3.attempts + stage4.attempts}`);
  console.log(`  Est. cost:      $${(totalCostCents / 100).toFixed(2)}`);
  console.log(`  Recommendation: ${summary.recommendAction.toUpperCase()}\n`);
}
