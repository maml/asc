import { SectionWrapper } from "./section-wrapper";
import { FadeIn } from "./fade-in";

const domains = [
  {
    name: "Registry",
    tools: 12,
    examples: "Register providers, discover agents, search marketplace, manage capabilities and pricing",
  },
  {
    name: "Coordination",
    tools: 5,
    examples: "Submit tasks, invoke-and-wait, get status, list events",
  },
  {
    name: "Pipeline",
    tools: 10,
    examples: "Create multi-agent chains, execute pipelines, track step-by-step progress",
  },
  {
    name: "Billing",
    tools: 5,
    examples: "List billing events, usage summaries, month-to-date spend, invoice management",
  },
  {
    name: "Observability",
    tools: 10,
    examples: "Distributed traces, SLA rules, quality gates, compliance checks",
  },
  {
    name: "Settlement",
    tools: 5,
    examples: "List settlements, get summaries, manage provider configs, trigger reconciliation",
  },
  {
    name: "Onboarding",
    tools: 3,
    examples: "Interactive setup, sandbox exploration, config status checks",
  },
];

export function McpSection() {
  return (
    <SectionWrapper id="mcp">
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-3">
          The Magic
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
          One MCP Server. 50 Tools. Zero Integration Code.
        </h2>
        <p className="text-gray max-w-2xl mb-12">
          Drop the ASC MCP server into Claude Code, Cursor, or any MCP-compatible
          client. Your AI assistant immediately becomes a coordination platform operator —
          discovering agents, submitting tasks, building pipelines, and managing billing
          through natural conversation.
        </p>
      </FadeIn>

      {/* The conversation mockup */}
      <FadeIn delay={100}>
        <div className="rounded-lg border border-navy-light bg-navy-light/30 overflow-hidden mb-12 max-w-3xl">
          <div className="px-4 py-2.5 border-b border-navy-light/50 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber/40" />
            <span className="font-mono text-[11px] text-gray">
              Claude Code + ASC MCP Server
            </span>
          </div>
          <div className="p-5 space-y-4 font-mono text-[13px]">
            {/* User */}
            <div className="flex gap-3">
              <span className="text-blue shrink-0">you:</span>
              <span className="text-light">
                Find me a document processing agent and submit this NDA for legal review
              </span>
            </div>
            {/* AI */}
            <div className="flex gap-3">
              <span className="text-amber shrink-0">ai:</span>
              <div className="text-gray">
                <p className="mb-2">
                  I&apos;ll search the marketplace and submit the task.
                </p>
                <div className="rounded border border-navy-light p-3 mb-2 text-[12px] space-y-1">
                  <div className="text-gray/60">→ asc_registry_list_agents <span className="text-blue">(search: &quot;document processing&quot;, capability: &quot;legal-review&quot;)</span></div>
                  <div className="text-gray/60">→ Found <span className="text-light">legal-review-v2</span> by LegalAI Inc — 99.2% success rate, $0.05/invocation</div>
                  <div className="text-gray/60">→ asc_coordination_invoke_and_wait <span className="text-blue">(agentId: &quot;legal-review-v2&quot;, input: &#123;nda&#125;)</span></div>
                </div>
                <p>
                  Done. LegalAI flagged 3 non-standard clauses in sections 4.2, 7.1, and 9.3.
                  The full trace is at <span className="text-blue">trace-a8f3...</span> and
                  you were billed <span className="text-amber">$0.05</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Domain grid */}
      <FadeIn delay={200}>
        <p className="font-mono text-xs uppercase tracking-widest text-gray mb-4">
          50 tools across 7 domains
        </p>
      </FadeIn>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {domains.map((domain, i) => (
          <FadeIn key={domain.name} delay={200 + i * 75}>
            <div className="rounded-lg border border-navy-light p-5 hover:border-blue/30 transition-colors h-full">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono text-xs font-bold text-light uppercase tracking-wide">
                  {domain.name}
                </h3>
                <span className="font-mono text-[11px] text-amber">
                  {domain.tools} tools
                </span>
              </div>
              <p className="text-[13px] text-gray leading-relaxed">
                {domain.examples}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionWrapper>
  );
}
