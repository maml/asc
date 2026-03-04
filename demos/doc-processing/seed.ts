// Registers providers, agents, and consumer with the ASC backend, then activates all.
// Returns the IDs needed by the pipeline and wires agent handlers into the provider servers.

import type { AgentId, ProviderId, ConsumerId } from "../../src/types/brand.js";
import { wireDefaultHandlers as wireDocAI } from "./providers/docai-server.js";
import { wireDefaultHandlers as wireLegalAI } from "./providers/legalai-server.js";

const ASC = "http://127.0.0.1:3100";

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${ASC}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function patch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${ASC}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export interface SeedResult {
  consumerId: ConsumerId;
  docaiProviderId: ProviderId;
  legalaiProviderId: ProviderId;
  textExtractorId: AgentId;
  clauseDetectorId: AgentId;
  riskAnalyzerId: AgentId;
  summaryGeneratorId: AgentId;
}

export async function seed(): Promise<SeedResult> {
  console.log("\n📋 Registering entities with ASC...\n");

  // 1. Register providers
  const docai = (await post("/api/providers", {
    name: "DocAI Labs",
    description: "Document intelligence — OCR, clause detection, entity extraction",
    contactEmail: "api@docailabs.ai",
    webhookUrl: "http://127.0.0.1:4400",
  })) as { data: { provider: { id: ProviderId } } };
  const docaiId = docai.data.provider.id;
  console.log(`  Provider: DocAI Labs          → ${docaiId}`);

  const legalai = (await post("/api/providers", {
    name: "LegalAI Inc",
    description: "Legal document analysis — risk scoring, summarization, compliance",
    contactEmail: "api@legalai.co",
    webhookUrl: "http://127.0.0.1:4500",
  })) as { data: { provider: { id: ProviderId } } };
  const legalaiId = legalai.data.provider.id;
  console.log(`  Provider: LegalAI Inc          → ${legalaiId}`);

  // 2. Activate providers
  await patch(`/api/providers/${docaiId}`, { status: "active" });
  await patch(`/api/providers/${legalaiId}`, { status: "active" });

  // 3. Register agents
  const textExtractor = (await post(`/api/providers/${docaiId}/agents`, {
    name: "Text Extractor",
    description: "OCR and text extraction from document images and PDFs",
    version: "3.1.0",
    capabilities: [{
      name: "extract-text",
      description: "Extract structured text from documents",
      inputSchema: { type: "object", properties: { rawText: { type: "string" } } },
      outputSchema: { type: "object", properties: { extractedParagraphs: { type: "array" } } },
    }],
    pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 3, currency: "USD" } },
    sla: { maxLatencyMs: 2000, uptimePercentage: 99.5, maxErrorRate: 0.01 },
    supportsStreaming: false,
  })) as { data: { agent: { id: AgentId } } };
  const textExtractorId = textExtractor.data.agent.id;
  console.log(`  Agent: Text Extractor          → ${textExtractorId}`);

  const clauseDetector = (await post(`/api/providers/${docaiId}/agents`, {
    name: "Clause Detector",
    description: "Identifies and classifies contractual clauses",
    version: "2.4.0",
    capabilities: [{
      name: "detect-clauses",
      description: "Detect contractual clauses from extracted text",
      inputSchema: { type: "object", properties: { extractedParagraphs: { type: "array" } } },
      outputSchema: { type: "object", properties: { clauses: { type: "array" } } },
    }],
    pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 5, currency: "USD" } },
    sla: { maxLatencyMs: 1500, uptimePercentage: 99.5, maxErrorRate: 0.01 },
    supportsStreaming: false,
  })) as { data: { agent: { id: AgentId } } };
  const clauseDetectorId = clauseDetector.data.agent.id;
  console.log(`  Agent: Clause Detector         → ${clauseDetectorId}`);

  const riskAnalyzer = (await post(`/api/providers/${legalaiId}/agents`, {
    name: "Risk Analyzer",
    description: "Assesses legal risk per clause with ML-based scoring",
    version: "1.7.0",
    capabilities: [{
      name: "analyze-risk",
      description: "Score risk level for each contract clause",
      inputSchema: { type: "object", properties: { clauses: { type: "array" } } },
      outputSchema: { type: "object", properties: { assessments: { type: "array" } } },
    }],
    pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 8, currency: "USD" } },
    sla: { maxLatencyMs: 3000, uptimePercentage: 95.0, maxErrorRate: 0.15 },
    supportsStreaming: false,
  })) as { data: { agent: { id: AgentId } } };
  const riskAnalyzerId = riskAnalyzer.data.agent.id;
  console.log(`  Agent: Risk Analyzer           → ${riskAnalyzerId}`);

  const summaryGenerator = (await post(`/api/providers/${legalaiId}/agents`, {
    name: "Summary Generator",
    description: "Generates executive summaries from risk assessments",
    version: "2.0.0",
    capabilities: [{
      name: "generate-summary",
      description: "Create executive summary from risk analysis",
      inputSchema: { type: "object", properties: { assessments: { type: "array" } } },
      outputSchema: { type: "object", properties: { summary: { type: "string" } } },
    }],
    pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 10, currency: "USD" } },
    sla: { maxLatencyMs: 2000, uptimePercentage: 99.0, maxErrorRate: 0.02 },
    supportsStreaming: false,
  })) as { data: { agent: { id: AgentId } } };
  const summaryGeneratorId = summaryGenerator.data.agent.id;
  console.log(`  Agent: Summary Generator       → ${summaryGeneratorId}`);

  // 4. Activate all agents
  await Promise.all([
    patch(`/api/agents/${textExtractorId}`, { status: "active" }),
    patch(`/api/agents/${clauseDetectorId}`, { status: "active" }),
    patch(`/api/agents/${riskAnalyzerId}`, { status: "active" }),
    patch(`/api/agents/${summaryGeneratorId}`, { status: "active" }),
  ]);

  // 5. Register consumer
  const consumer = (await post("/api/consumers", {
    name: "Meridian Legal Group",
    description: "Full-service law firm — contract review automation",
    contactEmail: "tech@meridianlegal.com",
  })) as { data: { consumer: { id: ConsumerId } } };
  const consumerId = consumer.data.consumer.id;
  console.log(`  Consumer: Meridian Legal Group  → ${consumerId}`);

  // 6. Wire agent handlers into provider servers with their real UUIDs
  wireDocAI(textExtractorId, clauseDetectorId);
  wireLegalAI(riskAnalyzerId, summaryGeneratorId);

  console.log("\n  ✓ All entities registered and active\n");

  return {
    consumerId,
    docaiProviderId: docaiId,
    legalaiProviderId: legalaiId,
    textExtractorId,
    clauseDetectorId,
    riskAnalyzerId,
    summaryGeneratorId,
  };
}
