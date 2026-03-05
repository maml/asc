"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Bot,
  Users,
  ListTodo,
  Activity,
  GitBranch,
  ShieldCheck,
  DollarSign,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor: "green" | "blue" | "yellow" | "red";
  delay: number;
}

const accentClasses = {
  green: {
    iconBg: "bg-accent-green/10",
    iconText: "text-accent-green",
    dot: "bg-accent-green",
  },
  blue: {
    iconBg: "bg-accent-blue/10",
    iconText: "text-accent-blue",
    dot: "bg-accent-blue",
  },
  yellow: {
    iconBg: "bg-accent-yellow/10",
    iconText: "text-accent-yellow",
    dot: "bg-accent-yellow",
  },
  red: {
    iconBg: "bg-accent-red/10",
    iconText: "text-accent-red",
    dot: "bg-accent-red",
  },
};

function StatCard({ title, value, subtitle, icon: Icon, accentColor, delay }: StatCardProps) {
  const accent = accentClasses[accentColor];
  return (
    <div
      className="card-hover animate-fade-in rounded-xl border border-border-subtle bg-surface p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">{title}</p>
          <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${accent.dot}`} />
            {subtitle}
          </p>
        </div>
        <div className={`rounded-lg p-2 ${accent.iconBg}`}>
          <Icon size={18} className={accent.iconText} />
        </div>
      </div>
    </div>
  );
}

interface DashboardStats {
  providers: number;
  agents: number;
  consumers: number;
  activeTasks: number;
  events24h: number;
  traces: number;
  slaCompliance: string;
  spendMtd: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    providers: 0,
    agents: 0,
    consumers: 0,
    activeTasks: 0,
    events24h: 0,
    traces: 0,
    slaCompliance: "—",
    spendMtd: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const f = (url: string) => fetch(url).then((r) => r.json()).catch(() => null);

    Promise.all([
      f(`${API_BASE}/api/providers?limit=100`),
      f(`${API_BASE}/api/agents?limit=100`),
      f(`${API_BASE}/api/consumers?limit=100`),
      f(`${API_BASE}/api/tasks?status=in_progress&limit=100`),
      f(`${API_BASE}/api/traces?limit=100`),
      f(`${API_BASE}/api/sla-compliance?limit=50`),
      f(`${API_BASE}/api/billing/mtd`),
    ]).then(([provRes, agentRes, consRes, taskRes, traceRes, slaRes, mtdRes]) => {
      // Count total from arrays (these endpoints return arrays)
      const providers = provRes?.data?.providers?.length ?? 0;
      const agents = agentRes?.data?.agents?.length ?? 0;
      const consumers = consRes?.data?.consumers?.length ?? 0;
      const activeTasks = taskRes?.data?.tasks?.length ?? 0;
      const traces = traceRes?.data?.traces?.length ?? 0;

      // SLA compliance: ratio of compliant records
      const slaRecords = slaRes?.data?.records ?? [];
      let slaCompliance = "—";
      if (slaRecords.length > 0) {
        const compliant = slaRecords.filter((r: { status: string }) => r.status === "compliant").length;
        slaCompliance = `${Math.round((compliant / slaRecords.length) * 100)}%`;
      }

      const spendMtd = mtdRes?.data?.totalCents ?? 0;

      setStats({ providers, agents, consumers, activeTasks, events24h: 0, traces, slaCompliance, spendMtd });
      setLoaded(true);
    });
  }, []);

  const fmt = (n: number) => String(n);
  const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const providerSub = stats.providers > 0 ? `${stats.providers} registered` : "No providers registered";
  const agentSub = stats.agents > 0 ? `${stats.agents} registered` : "No agents registered";
  const consumerSub = stats.consumers > 0 ? `${stats.consumers} registered` : "No consumers registered";
  const taskSub = stats.activeTasks > 0 ? `${stats.activeTasks} in progress` : "No tasks in progress";
  const traceSub = stats.traces > 0 ? `${stats.traces} captured` : "No traces captured";
  const slaSub = stats.slaCompliance !== "—" ? "Across all rules" : "No SLA rules defined";
  const spendSub = stats.spendMtd > 0 ? "This month" : "No billing events";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-organizational agent coordination at a glance
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Providers" value={loaded ? fmt(stats.providers) : "—"} subtitle={providerSub} icon={Building2} accentColor="green" delay={50} />
        <StatCard title="Agents" value={loaded ? fmt(stats.agents) : "—"} subtitle={agentSub} icon={Bot} accentColor="blue" delay={100} />
        <StatCard title="Consumers" value={loaded ? fmt(stats.consumers) : "—"} subtitle={consumerSub} icon={Users} accentColor="yellow" delay={150} />
        <StatCard title="Active Tasks" value={loaded ? fmt(stats.activeTasks) : "—"} subtitle={taskSub} icon={ListTodo} accentColor="green" delay={200} />
      </div>

      <div className="mb-8 animate-fade-in" style={{ animationDelay: "250ms" }}>
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">System Health</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Events (24h)" value={loaded ? fmt(stats.events24h) : "—"} subtitle="Coordination events" icon={Activity} accentColor="blue" delay={300} />
        <StatCard title="Traces" value={loaded ? fmt(stats.traces) : "—"} subtitle={traceSub} icon={GitBranch} accentColor="green" delay={350} />
        <StatCard title="SLA Compliance" value={loaded ? stats.slaCompliance : "—"} subtitle={slaSub} icon={ShieldCheck} accentColor="yellow" delay={400} />
        <StatCard title="Spend (MTD)" value={loaded ? fmtMoney(stats.spendMtd) : "—"} subtitle={spendSub} icon={DollarSign} accentColor="blue" delay={450} />
      </div>

      {loaded && stats.providers === 0 && (
        <div
          className="animate-fade-in mt-12 rounded-xl border border-dashed border-border bg-surface/50 p-10 text-center"
          style={{ animationDelay: "500ms" }}
        >
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent-green/10">
            <Bot size={20} className="text-accent-green" />
          </div>
          <h3 className="text-sm font-medium text-foreground">Get started with ASC</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Register your first provider and agent to begin coordinating AI services across
            organizational boundaries.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <a
              href="/providers"
              className="rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Register Provider
            </a>
            <a
              href="/agents"
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              Browse Agents
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
