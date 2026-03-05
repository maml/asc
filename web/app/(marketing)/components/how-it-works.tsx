import {
  ArrowLeftRight,
  ShieldOff,
  ShieldCheck,
  FileCheck,
  Receipt,
  Activity,
  Fingerprint,
  Zap,
} from "lucide-react";
import { SectionWrapper } from "./section-wrapper";
import { FadeIn } from "./fade-in";

const steps = [
  {
    title: "Register",
    detail:
      "Providers register agents with capabilities, pricing, and SLAs. Consumers get an API key. That's the entire setup.",
  },
  {
    title: "Coordinate",
    detail:
      "Submit tasks through ASC. Routing, quality gates, retries, circuit breaking, billing, and full-chain tracing happen automatically.",
  },
  {
    title: "Scale",
    detail:
      "Add providers, build pipelines, enforce SLAs. The coordination layer grows with you — no N² integration problem.",
  },
];

const capabilities = [
  {
    icon: ArrowLeftRight,
    title: "Routing & Retries",
    description: "Intelligent task routing with priority-based retry logic. Critical tasks get 5 attempts with exponential backoff.",
  },
  {
    icon: ShieldOff,
    title: "Circuit Breaker",
    description: "Per-agent state machine (closed → open → half-open). Prevents cascading failures. State changes broadcast via WebSocket.",
  },
  {
    icon: ShieldCheck,
    title: "Quality Gates",
    description: "JSON Schema validation, latency thresholds, regex matching, webhook checks. Required or optional, pre- or post-execution.",
  },
  {
    icon: FileCheck,
    title: "SLA Enforcement",
    description: "Rule-based per agent — latency, uptime, error rate, throughput. Window-based evaluation with compliance tracking.",
  },
  {
    icon: Receipt,
    title: "Billing & Metering",
    description: "Per-invocation, per-token, per-second, or flat monthly. Pricing snapshots frozen at billing time. Full invoice lifecycle.",
  },
  {
    icon: Activity,
    title: "Observability",
    description: "Distributed tracing across the full coordination chain. Span hierarchy, latency tracking, and metadata tagging per task.",
  },
  {
    icon: Fingerprint,
    title: "Trust & Identity",
    description: "secp256k1 keypairs with BIP-32 HD derivation. Dual auth: API keys or cryptographic signatures. Nonce-based replay protection.",
  },
  {
    icon: Zap,
    title: "Lightning Settlement",
    description: "L2-agnostic adapter pattern. Lightning via Strike, noop for dev. Platform fees, reconciliation, and provider config built in.",
  },
];

export function HowItWorks() {
  return (
    <SectionWrapper id="how-it-works">
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-3">
          Architecture
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-light mb-4 font-mono">
          How It Works
        </h2>
        <p className="text-gray max-w-2xl mb-12">
          Three steps. One integration point. Full coordination infrastructure.
        </p>
      </FadeIn>

      {/* Flow diagram */}
      <FadeIn delay={100}>
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-16 font-mono text-sm">
          <div className="border border-blue/50 rounded-lg px-6 py-4 text-center">
            <div className="text-blue font-bold">Consumer</div>
            <div className="text-[11px] text-gray">Your application</div>
          </div>
          <div className="text-gray hidden md:block">→</div>
          <div className="text-gray md:hidden">↓</div>
          <div className="border-2 border-amber rounded-lg px-8 py-4 text-center">
            <div className="text-amber font-bold text-lg">ASC</div>
            <div className="text-[10px] text-gray space-x-2">
              <span>routing</span>
              <span>·</span>
              <span>quality</span>
              <span>·</span>
              <span>billing</span>
              <span>·</span>
              <span>tracing</span>
            </div>
          </div>
          <div className="text-gray hidden md:block">→</div>
          <div className="text-gray md:hidden">↓</div>
          <div className="border border-blue/50 rounded-lg px-6 py-4 text-center">
            <div className="text-blue font-bold">Provider</div>
            <div className="text-[11px] text-gray">Agent service</div>
          </div>
        </div>
      </FadeIn>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {steps.map((step, i) => (
          <FadeIn key={step.title} delay={i * 75}>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-navy-light font-mono text-amber font-bold mb-3">
                {i + 1}
              </div>
              <h3 className="font-mono text-sm font-bold text-light mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-gray leading-relaxed">{step.detail}</p>
            </div>
          </FadeIn>
        ))}
      </div>

      {/* Capability grid */}
      <FadeIn>
        <p className="font-mono text-xs uppercase tracking-widest text-blue mb-6">
          What You Get
        </p>
      </FadeIn>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {capabilities.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <FadeIn key={cap.title} delay={i * 75}>
              <div className="rounded-lg border border-navy-light p-5 hover:border-blue/30 transition-colors h-full">
                <Icon size={20} className="text-blue mb-3" />
                <h3 className="font-mono text-xs font-bold text-light mb-1.5 uppercase tracking-wide">
                  {cap.title}
                </h3>
                <p className="text-[13px] text-gray leading-relaxed">
                  {cap.description}
                </p>
              </div>
            </FadeIn>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
