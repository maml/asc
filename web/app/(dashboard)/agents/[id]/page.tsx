"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Bot, ArrowLeft, Zap, Clock, Shield, Activity, DollarSign, BarChart3 } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Agent {
  id: string;
  providerId: string;
  name: string;
  description: string;
  version: string;
  status: string;
  capabilities: { name: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }[];
  pricing: { type: string; pricePerCall?: { amountCents: number; currency: string }; inputPricePerToken?: { amountCents: number; currency: string }; outputPricePerToken?: { amountCents: number; currency: string }; pricePerSecond?: { amountCents: number; currency: string }; monthlyPrice?: { amountCents: number; currency: string } };
  sla: { maxLatencyMs: number; uptimePercentage: number; maxErrorRate: number };
  supportsStreaming: boolean;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface AgentStats {
  totalInvocations: number;
  successRate: number;
  avgLatencyMs: number;
  last30Days: { invocations: number; revenue: number };
}

interface Provider {
  id: string;
  name: string;
}

function formatPricing(pricing: Agent["pricing"]): string {
  switch (pricing.type) {
    case "per_invocation":
      return pricing.pricePerCall ? `$${(pricing.pricePerCall.amountCents / 100).toFixed(2)} per call` : "Per invocation";
    case "per_token":
      return pricing.inputPricePerToken
        ? `$${(pricing.inputPricePerToken.amountCents / 100).toFixed(4)}/input tok, $${(pricing.outputPricePerToken!.amountCents / 100).toFixed(4)}/output tok`
        : "Per token";
    case "per_second":
      return pricing.pricePerSecond ? `$${(pricing.pricePerSecond.amountCents / 100).toFixed(2)} per second` : "Per second";
    case "flat_monthly":
      return pricing.monthlyPrice ? `$${(pricing.monthlyPrice.amountCents / 100).toFixed(0)}/month` : "Flat monthly";
    default:
      return pricing.type.replace(/_/g, " ");
  }
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-muted">
        <Icon size={14} />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents/${id}`).then((r) => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json();
      }),
      fetch(`${API_BASE}/api/agents/${id}/stats`).then((r) => r.json()).catch(() => ({ data: null })),
    ])
      .then(async ([agentRes, statsRes]) => {
        const a = agentRes.data;
        setAgent(a);
        setStats(statsRes.data);
        // Fetch provider name
        try {
          const provRes = await fetch(`${API_BASE}/api/providers/${a.providerId}`).then((r) => r.json());
          setProvider(provRes.data);
        } catch { /* noop */ }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (error || !agent) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Agent not found"}</p>
        <Link href="/agents" className="mt-4 inline-flex items-center gap-1 text-sm text-accent-blue hover:underline">
          <ArrowLeft size={14} /> Back to Marketplace
        </Link>
      </div>
    );
  }

  const metaEntries = Object.entries(agent.metadata ?? {});

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <Link href="/agents" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back to Marketplace
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-blue/10">
              <Bot size={24} className="text-accent-blue" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-foreground">{agent.name}</h1>
                <StatusBadge status={agent.status} />
              </div>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-mono">v{agent.version}</span>
                {provider && <span>by {provider.name}</span>}
                {agent.supportsStreaming && (
                  <span className="flex items-center gap-1 text-accent-green"><Zap size={13} /> Streaming</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-2 text-sm font-medium text-foreground">Description</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={Activity} label="Total Invocations" value={stats.totalInvocations.toLocaleString()} sub={`${stats.last30Days.invocations} in last 30d`} />
          <StatCard icon={Shield} label="Success Rate" value={`${(stats.successRate * 100).toFixed(1)}%`} />
          <StatCard icon={Clock} label="Avg Latency" value={`${stats.avgLatencyMs}ms`} sub={`SLA: ${agent.sla.maxLatencyMs}ms`} />
          <StatCard icon={DollarSign} label="Revenue (30d)" value={`$${(stats.last30Days.revenue / 100).toFixed(2)}`} />
        </div>
      )}

      {/* Capabilities */}
      {agent.capabilities.length > 0 && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">Capabilities</h2>
          <div className="space-y-3">
            {agent.capabilities.map((cap) => (
              <div key={cap.name} className="rounded-lg border border-border-subtle bg-background p-4">
                <p className="text-sm font-medium text-foreground">{cap.name}</p>
                {cap.description && <p className="mt-1 text-xs text-muted-foreground">{cap.description}</p>}
                <div className="mt-2 flex gap-4">
                  {Object.keys(cap.inputSchema).length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Input</p>
                      <pre className="mt-1 text-[11px] text-muted-foreground">{JSON.stringify(cap.inputSchema, null, 2)}</pre>
                    </div>
                  )}
                  {Object.keys(cap.outputSchema).length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Output</p>
                      <pre className="mt-1 text-[11px] text-muted-foreground">{JSON.stringify(cap.outputSchema, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing + SLA */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border-subtle bg-surface p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">Pricing</h2>
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-accent-blue" />
            <span className="text-sm text-foreground">{formatPricing(agent.pricing)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Type: {agent.pricing.type.replace(/_/g, " ")}</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">SLA Commitments</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted" />
              <span>Max latency: <span className="font-mono text-foreground">{agent.sla.maxLatencyMs}ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-muted" />
              <span>Uptime: <span className="font-mono text-foreground">{agent.sla.uptimePercentage}%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-muted" />
              <span>Max error rate: <span className="font-mono text-foreground">{(agent.sla.maxErrorRate * 100).toFixed(1)}%</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      {metaEntries.length > 0 && (
        <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-6">
          <h2 className="mb-3 text-sm font-medium text-foreground">Metadata</h2>
          <div className="space-y-1">
            {metaEntries.map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-muted">{key}:</span>
                <span className="text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="text-[11px] text-muted">
        Created {new Date(agent.createdAt).toLocaleDateString()} &middot; Updated {new Date(agent.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}
