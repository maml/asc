"use client";

import { useEffect, useState } from "react";
import { BarChart3, DollarSign, Hash, TrendingUp, Activity } from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface BillingEvent {
  id: string;
  taskId: string;
  agentId: string;
  providerId: string;
  consumerId: string;
  eventType: string;
  amountCents: number;
  currency: string;
  pricingSnapshot: { agentId: string; pricing: { type: string }; capturedAt: string };
  occurredAt: string;
  metadata: Record<string, unknown>;
}

interface Agent { id: string; name: string; }
interface Consumer { id: string; name: string; }

interface UsageSummary {
  totalCents: number;
  eventCount: number;
  byAgent: { agentId: string; totalCents: number; eventCount: number }[];
}

const eventTypeBadgeColors: Record<string, { bg: string; text: string }> = {
  invocation: { bg: "bg-accent-green/10", text: "text-accent-green" },
  streaming_session: { bg: "bg-accent-blue/10", text: "text-accent-blue" },
  adjustment: { bg: "bg-accent-yellow/10", text: "text-accent-yellow" },
  refund: { bg: "bg-accent-red/10", text: "text-accent-red" },
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function EventTypeBadge({ type }: { type: string }) {
  const colors = eventTypeBadgeColors[type] ?? { bg: "bg-surface-raised", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, accent }: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-muted" />
        <span className="text-xl font-semibold tracking-tight text-foreground">{value}</span>
      </div>
    </div>
  );
}

export default function UsagePage() {
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [mtdCents, setMtdCents] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = now.toISOString();

    Promise.all([
      fetch(`${API_BASE}/api/billing/mtd`).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/billing/usage?periodStart=${periodStart}&periodEnd=${periodEnd}`).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/billing-events?limit=30`).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/agents?limit=50`).then((r) => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/consumers?limit=50`).then((r) => r.json()).catch(() => null),
    ])
      .then(([mtdRes, usageRes, eventsRes, agentsRes, consumersRes]) => {
        setMtdCents(mtdRes?.data?.amountCents ?? mtdRes?.data?.totalCents ?? 0);
        setUsageSummary(usageRes?.data ?? null);
        setBillingEvents(eventsRes?.data?.events ?? eventsRes?.data?.billingEvents ?? []);
        setAgents(agentsRes?.data?.agents ?? []);
        setConsumers(consumersRes?.data?.consumers ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const consumerName = (id: string) => consumers.find((c) => c.id === id)?.name ?? id;

  const totalCents = usageSummary?.totalCents ?? mtdCents;
  const eventCount = usageSummary?.eventCount ?? billingEvents.length;
  const avgCost = eventCount > 0 ? totalCents / eventCount : 0;
  const byAgent = usageSummary?.byAgent ?? [];
  const maxAgentSpend = byAgent.length > 0 ? Math.max(...byAgent.map((a) => a.totalCents)) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track billing events and resource consumption
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : billingEvents.length === 0 && byAgent.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No billing events yet"
          description="Billing events will appear here as agents process tasks and generate usage."
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard
              icon={DollarSign}
              label="Month-to-date spend"
              value={formatMoney(mtdCents || totalCents)}
              accent="bg-accent-green"
            />
            <StatCard
              icon={Hash}
              label="Total events this month"
              value={eventCount.toLocaleString()}
              accent="bg-accent-blue"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg cost per invocation"
              value={formatMoney(Math.round(avgCost))}
              accent="bg-accent-yellow"
            />
          </div>

          {/* Usage breakdown by agent */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Activity size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Usage by Agent</h2>
            </div>
            {byAgent.length === 0 ? (
              <div className="rounded-xl border border-border-subtle bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
                No usage data yet
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-border-subtle bg-surface p-5">
                {byAgent.map((entry) => {
                  const pct = maxAgentSpend > 0 ? (entry.totalCents / maxAgentSpend) * 100 : 0;
                  return (
                    <div key={entry.agentId} className="flex items-center gap-4">
                      <span className="w-36 shrink-0 truncate text-sm font-medium text-foreground">
                        {agentName(entry.agentId)}
                      </span>
                      <div className="relative h-6 flex-1 rounded-md bg-surface-raised">
                        <div
                          className="h-full rounded-md bg-accent-green/70 transition-all"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-sm text-muted-foreground">
                        {formatMoney(entry.totalCents)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent billing events table */}
          {billingEvents.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">Recent Billing Events</h2>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Event Type</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Consumer</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Pricing Model</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3">
                          <EventTypeBadge type={ev.eventType} />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {agentName(ev.agentId)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {consumerName(ev.consumerId)}
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground">
                          {formatMoney(ev.amountCents)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {ev.pricingSnapshot?.pricing?.type ?? "unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatTime(ev.occurredAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
