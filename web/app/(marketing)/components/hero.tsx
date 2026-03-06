import { ParticleCanvas } from "./particle-canvas";
import { FadeIn } from "./fade-in";
import stats from "../../stats.json";

const mcpConfig = `{
  "mcpServers": {
    "asc": {
      "command": "npx",
      "args": ["@asc-so/mcp-server"]
    }
  }
}
// Run asc_onboard to configure credentials automatically`;

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <ParticleCanvas />

      <div className="relative mx-auto max-w-[1200px] px-6 pt-20 pb-16 text-center">
        {/* Badge */}
        <FadeIn>
          <div className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-gray mb-8">
            <span>Open Source</span>
            <span className="text-navy-light">·</span>
            <span>{stats.mcpTools} MCP Tools</span>
            <span className="text-navy-light">·</span>
            <span>Self-Hostable</span>
          </div>
        </FadeIn>

        {/* Headline */}
        <FadeIn delay={100}>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-light mb-6 font-mono">
            The missing infrastructure layer
            <br />
            for the{" "}
            <span className="text-amber">agent services economy</span>
          </h1>
        </FadeIn>

        {/* Tagline — MCP-first */}
        <FadeIn delay={200}>
          <p className="text-lg md:text-xl text-gray max-w-2xl mx-auto mb-10 leading-relaxed">
            Add one MCP server. Your AI handles the rest — discovering agents,
            coordinating tasks, settling payments, and tracing everything across
            organizational boundaries.
          </p>
        </FadeIn>

        {/* MCP config — the hook */}
        <FadeIn delay={300}>
          <div className="mx-auto max-w-lg mb-4 rounded-lg border border-navy-light bg-navy-light/50 overflow-hidden text-left">
            <div className="flex items-center justify-between px-4 py-2 border-b border-navy-light/50">
              <span className="font-mono text-[11px] text-gray">
                claude_desktop_config.json
              </span>
              <span className="font-mono text-[10px] text-amber uppercase tracking-wider">
                That&apos;s it.
              </span>
            </div>
            <pre className="p-4 text-[13px] font-mono leading-relaxed text-ice overflow-x-auto">
              {mcpConfig}
            </pre>
          </div>
          <p className="text-sm text-gray mb-10">
            {stats.mcpTools} tools for discovery, coordination, billing, observability, and settlement —
            through natural conversation.
          </p>
        </FadeIn>

        {/* CTAs */}
        <FadeIn delay={400}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="#mcp"
              className="font-mono text-xs uppercase tracking-widest bg-amber text-navy px-6 py-3 rounded hover:bg-amber/90 transition-colors font-bold"
            >
              Add to Claude Code
            </a>
            <a
              href="/canvas"
              className="font-mono text-xs uppercase tracking-widest border border-navy-light text-light px-6 py-3 rounded hover:border-blue/50 hover:text-blue transition-colors"
            >
              Explore Dashboard &rarr;
            </a>
          </div>
        </FadeIn>

        {/* Social proof */}
        <FadeIn delay={500}>
          <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-[11px] text-gray uppercase tracking-wider">
            <span>{stats.tests} tests</span>
            <span className="text-navy-light">·</span>
            <span>{stats.endpoints} endpoints</span>
            <span className="text-navy-light">·</span>
            <span>Dual auth</span>
            <span className="text-navy-light">·</span>
            <span>Lightning settlement</span>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
