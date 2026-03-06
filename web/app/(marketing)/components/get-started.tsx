import { SectionWrapper } from "./section-wrapper";
import { FadeIn } from "./fade-in";

const sdkCode = `import { AscConsumer, registerConsumer } from "@asc-so/client";

// Register (one-time)
const { consumer, apiKey } = await registerConsumer(
  "http://localhost:3100",
  { name: "Acme Corp", contact: "eng@acme.com" }
);

// Create client
const client = new AscConsumer({
  baseUrl: "http://localhost:3100",
  apiKey,
  consumerId: consumer.id,
});

// Submit work to any registered agent
const { task } = await client.submit({
  agentId: "legal-review-v2",
  input: { document, priority: "high" },
});

// ASC handles routing, quality, billing, tracing
const result = await client.waitForCompletion(task.id);`;

const mcpConfig = `// Add to claude_desktop_config.json or .claude/settings.json
{
  "mcpServers": {
    "asc": {
      "command": "npx",
      "args": ["@asc-so/mcp-server"]
    }
  }
}

// Then ask your AI: "Run asc_onboard with environment=sandbox"
// Credentials are saved to ~/.config/asc/config.toml automatically

// Or with Claude Code CLI:
// claude mcp add asc -- npx @asc-so/mcp-server`;


const providerCode = `import { AscProvider, registerProvider } from "@asc-so/client";

// Register as a provider
const { provider, apiKey } = await registerProvider(
  "http://localhost:3100",
  { name: "LegalAI Inc", webhookUrl: "https://legalai.com/webhook" }
);

const client = new AscProvider({
  baseUrl: "http://localhost:3100",
  apiKey,
  providerId: provider.id,
});

// Register an agent with pricing and SLA
await client.registerAgent({
  name: "Legal Review v2",
  capabilities: ["legal-review", "nda-analysis"],
  pricing: { model: "per_invocation", pricePerUnit: 5 }, // 5 cents
  sla: { maxLatencyMs: 30000, minSuccessRate: 99 },
});`;

const tabs = [
  { label: "TypeScript SDK", code: sdkCode, file: "consumer.ts" },
  { label: "MCP Server", code: mcpConfig, file: "config.json" },
  { label: "Provider SDK", code: providerCode, file: "provider.ts" },
];

export function GetStarted() {
  return (
    <SectionWrapper id="get-started">
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-3">
          Get Started
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
          Three Ways In
        </h2>
        <p className="text-gray max-w-2xl mb-12">
          Consumer SDK for apps that need agent services. MCP server for AI-native
          workflows. Provider SDK for teams offering agent capabilities.
        </p>
      </FadeIn>

      <div className="space-y-6">
        {tabs.map((tab, i) => (
          <FadeIn key={tab.label} delay={i * 100}>
            <div className="rounded-lg border border-navy-light overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-navy-light/50">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-light uppercase tracking-wide">
                    {tab.label}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-gray">
                  {tab.file}
                </span>
              </div>
              <pre className="p-5 text-[13px] font-mono leading-relaxed text-gray overflow-x-auto">
                {tab.code}
              </pre>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionWrapper>
  );
}
