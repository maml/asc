import Link from "next/link";
import { FadeIn } from "./fade-in";

export function Footer() {
  return (
    <footer className="px-6 py-24">
      <div className="mx-auto max-w-[1200px]">
        {/* CTA */}
        <FadeIn>
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
              Stop building coordination infrastructure.
              <br />
              <span className="text-amber">Start using it.</span>
            </h2>
            <p className="text-gray max-w-lg mx-auto mb-8">
              Open-source. Self-hostable. Production-ready. 527 tests. 57 endpoints.
              50 MCP tools. Running today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#mcp"
                className="font-mono text-xs uppercase tracking-widest bg-amber text-navy px-6 py-3 rounded hover:bg-amber/90 transition-colors font-bold"
              >
                Add to Claude Code
              </a>
              <Link
                href="/canvas"
                className="font-mono text-xs uppercase tracking-widest border border-navy-light text-light px-6 py-3 rounded hover:border-blue/50 hover:text-blue transition-colors"
              >
                Explore Dashboard &rarr;
              </Link>
            </div>
          </div>
        </FadeIn>

        {/* Footer bar */}
        <div className="border-t border-navy-light pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-gray uppercase tracking-widest">
          <span>&copy; {new Date().getFullYear()} ASC</span>
          <span className="text-light/30">
            The coordination layer for the agent services economy.
          </span>
        </div>
      </div>
    </footer>
  );
}
