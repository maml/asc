import { SectionWrapper } from "./section-wrapper";
import { FadeIn } from "./fade-in";

const stats = [
  {
    value: "N²",
    label: "Integration complexity",
    detail:
      "Every new agent-to-agent connection requires custom integration. Five providers means ten point-to-point integrations. Ten means forty-five. The math breaks down fast.",
  },
  {
    value: "60–70%",
    label: "Engineering effort on plumbing",
    detail:
      "Teams building multi-agent systems spend the majority of their time on retries, quality checks, billing reconciliation, and tracing — not on agent capabilities.",
  },
  {
    value: "70%",
    label: "Failure rate at handoff boundaries",
    detail:
      "Complex multi-agent tasks don't fail inside individual agents. They fail at the boundaries between organizations — where there's no shared infrastructure.",
  },
];

export function Problem() {
  return (
    <SectionWrapper id="problem">
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-3">
          The Problem
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
          The Coordination Gap
        </h2>
        <p className="text-gray max-w-2xl mb-12">
          Every platform coordinates agents inside one organization. Nobody
          coordinates them across organizations. That&apos;s the gap — and it&apos;s
          where agent-powered workflows break down.
        </p>
      </FadeIn>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <FadeIn key={stat.value} delay={i * 100}>
            <div className="rounded-lg border border-navy-light p-6 hover:border-blue/30 transition-colors h-full">
              <div className="font-mono text-3xl font-bold text-amber mb-2">
                {stat.value}
              </div>
              <div className="font-mono text-xs uppercase tracking-widest text-light mb-3">
                {stat.label}
              </div>
              <p className="text-sm text-gray leading-relaxed">
                {stat.detail}
              </p>
            </div>
          </FadeIn>
        ))}
      </div>
    </SectionWrapper>
  );
}
