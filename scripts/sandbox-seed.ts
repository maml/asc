// Sandbox seed script — registers demo agents and pipelines for new user exploration.
// Usage: ASC_BASE_URL=https://preview-api.asc.so npm run seed:sandbox

import { registerProvider, registerConsumer, AscProvider, AscConsumer } from "@asc-so/client";
import type { ProviderId, ConsumerId } from "@asc-so/client";

const BASE_URL = process.env["ASC_BASE_URL"] ?? "http://localhost:3100";
const WEBHOOK_URL = `${BASE_URL}/sandbox-webhook`;

async function main(): Promise<void> {
  console.log(`Seeding sandbox at ${BASE_URL}...\n`);

  // Register demo provider
  const providerResult = await registerProvider(BASE_URL, {
    name: "ASC Demo Provider",
    description: "Pre-built demo agents for sandbox exploration",
    contactEmail: "sandbox@asc.so",
    webhookUrl: WEBHOOK_URL,
  });
  console.log(`Provider: ${providerResult.provider.id}`);
  console.log(`Provider API Key: ${providerResult.apiKey}\n`);

  const provider = new AscProvider({
    baseUrl: BASE_URL,
    apiKey: providerResult.apiKey,
    providerId: providerResult.provider.id as ProviderId,
  });

  // Register demo agents
  const agents = [
    {
      name: "EchoAgent",
      description: "Echoes input back — useful for testing coordination flows",
      version: "1.0.0",
      capabilities: [{ name: "echo", description: "Echo input", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 1, currency: "USD" } },
      sla: { maxLatencyMs: 1000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
      supportsStreaming: false,
    },
    {
      name: "DocExtractor",
      description: "Extracts text and metadata from documents (PDF, DOCX, images)",
      version: "1.0.0",
      capabilities: [{ name: "extract", description: "Extract document content", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 5, currency: "USD" } },
      sla: { maxLatencyMs: 5000, uptimePercentage: 99.5, maxErrorRate: 0.02 },
      supportsStreaming: false,
    },
    {
      name: "LegalReview",
      description: "Reviews documents for legal compliance and flags risks",
      version: "1.0.0",
      capabilities: [{ name: "review", description: "Legal document review", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 10, currency: "USD" } },
      sla: { maxLatencyMs: 10000, uptimePercentage: 99.0, maxErrorRate: 0.05 },
      supportsStreaming: false,
    },
    {
      name: "Translator",
      description: "Translates text between 50+ languages",
      version: "1.0.0",
      capabilities: [{ name: "translate", description: "Text translation", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 3, currency: "USD" } },
      sla: { maxLatencyMs: 3000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
      supportsStreaming: true,
    },
    {
      name: "ComplianceCheck",
      description: "Checks content against regulatory frameworks (GDPR, SOC2, HIPAA)",
      version: "1.0.0",
      capabilities: [{ name: "check", description: "Compliance verification", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 8, currency: "USD" } },
      sla: { maxLatencyMs: 8000, uptimePercentage: 99.5, maxErrorRate: 0.03 },
      supportsStreaming: false,
    },
    {
      name: "SummaryGen",
      description: "Generates concise summaries of long documents or data sets",
      version: "1.0.0",
      capabilities: [{ name: "summarize", description: "Document summarization", inputSchema: { type: "object" }, outputSchema: { type: "object" } }],
      pricing: { type: "per_invocation" as const, pricePerCall: { amountCents: 5, currency: "USD" } },
      sla: { maxLatencyMs: 5000, uptimePercentage: 99.5, maxErrorRate: 0.02 },
      supportsStreaming: true,
    },
  ];

  const agentIds: string[] = [];
  for (const agent of agents) {
    const result = await provider.registerAgent(agent);
    agentIds.push(result.id);
    console.log(`Agent: ${result.name} (${result.id})`);
  }

  // Register demo consumer
  const consumerResult = await registerConsumer(BASE_URL, {
    name: "ASC Demo Consumer",
    description: "Demo consumer for sandbox exploration",
    contactEmail: "sandbox@asc.so",
  });
  console.log(`\nConsumer: ${consumerResult.consumer.id}`);
  console.log(`Consumer API Key: ${consumerResult.apiKey}\n`);

  const consumer = new AscConsumer({
    baseUrl: BASE_URL,
    apiKey: consumerResult.apiKey,
    consumerId: consumerResult.consumer.id as ConsumerId,
  });

  // Create demo pipelines
  const ndaPipeline = await consumer.createPipeline({
    name: "NDA Review",
    description: "4-step NDA review: extract → legal review → compliance → summary",
    steps: [
      { agentId: agentIds[1]!, name: "Extract", config: {} },
      { agentId: agentIds[2]!, name: "Legal Review", config: {} },
      { agentId: agentIds[4]!, name: "Compliance Check", config: {} },
      { agentId: agentIds[5]!, name: "Summary", config: {} },
    ],
  });
  console.log(`Pipeline: NDA Review (${ndaPipeline.id})`);

  const multiLangPipeline = await consumer.createPipeline({
    name: "Multi-Language Compliance",
    description: "3-step: translate → compliance check → summary",
    steps: [
      { agentId: agentIds[3]!, name: "Translate", config: {} },
      { agentId: agentIds[4]!, name: "Compliance Check", config: {} },
      { agentId: agentIds[5]!, name: "Summary", config: {} },
    ],
  });
  console.log(`Pipeline: Multi-Language Compliance (${multiLangPipeline.id})`);

  console.log("\n--- Sandbox seeded successfully! ---");
  console.log(`\nTo configure MCP server, set:`);
  console.log(`  ASC_BASE_URL=${BASE_URL}`);
  console.log(`  ASC_CONSUMER_API_KEY=${consumerResult.apiKey}`);
  console.log(`  ASC_CONSUMER_ID=${consumerResult.consumer.id}`);
  console.log(`  ASC_PROVIDER_API_KEY=${providerResult.apiKey}`);
  console.log(`  ASC_PROVIDER_ID=${providerResult.provider.id}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
