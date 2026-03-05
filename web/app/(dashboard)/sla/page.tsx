"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Plus, X, Loader2, Trash2, Play, Clock, AlertTriangle } from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Agent {
  id: string;
  name: string;
  providerId: string;
}

interface SlaRule {
  id: string;
  agentId: string;
  providerId: string;
  metricType: "latency" | "uptime" | "error_rate" | "throughput";
  threshold: number;
  windowMinutes: number;
  createdAt: string;
}

interface SlaComplianceRecord {
  id: string;
  ruleId: string;
  agentId: string;
  status: "compliant" | "warning" | "violated";
  currentValue: number;
  threshold: number;
  evaluatedAt: string;
  windowStart: string;
  windowEnd: string;
}

type MetricType = SlaRule["metricType"];

const metricLabels: Record<MetricType, string> = {
  latency: "Max Latency (ms)",
  error_rate: "Max Error Rate (0-1)",
  uptime: "Min Uptime (%)",
  throughput: "Min Throughput (req/s)",
};

const metricBadgeColors: Record<MetricType, { bg: string; text: string }> = {
  latency: { bg: "bg-accent-blue/10", text: "text-accent-blue" },
  error_rate: { bg: "bg-accent-red/10", text: "text-accent-red" },
  uptime: { bg: "bg-accent-green/10", text: "text-accent-green" },
  throughput: { bg: "bg-accent-yellow/10", text: "text-accent-yellow" },
};

const complianceColors: Record<SlaComplianceRecord["status"], { bg: string; text: string; dot: string }> = {
  compliant: { bg: "bg-accent-green/10", text: "text-accent-green", dot: "bg-accent-green" },
  warning: { bg: "bg-accent-yellow/10", text: "text-accent-yellow", dot: "bg-accent-yellow" },
  violated: { bg: "bg-accent-red/10", text: "text-accent-red", dot: "bg-accent-red" },
};

function formatThreshold(metricType: MetricType, value: number): string {
  switch (metricType) {
    case "latency": return `${value}ms`;
    case "error_rate": return `${(value * 100).toFixed(1)}%`;
    case "uptime": return `${value}%`;
    case "throughput": return `${value} req/s`;
  }
}

function MetricBadge({ type }: { type: MetricType }) {
  const colors = metricBadgeColors[type];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ComplianceBadge({ status }: { status: SlaComplianceRecord["status"] }) {
  const colors = complianceColors[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  );
}

export default function SlaPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [compliance, setCompliance] = useState<SlaComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evaluatingAgent, setEvaluatingAgent] = useState<string | null>(null);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [metricType, setMetricType] = useState<MetricType>("latency");
  const [threshold, setThreshold] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("60");

  const fetchRules = useCallback(() => {
    fetch(`${API_BASE}/api/sla-rules?limit=50`)
      .then((r) => r.json())
      .then((res) => setRules(res.data?.rules ?? []))
      .catch(() => {});
  }, []);

  const fetchCompliance = useCallback(() => {
    fetch(`${API_BASE}/api/sla-compliance?limit=30`)
      .then((r) => r.json())
      .then((res) => setCompliance(res.data?.records ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/sla-rules?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/sla-compliance?limit=30`).then((r) => r.json()),
    ])
      .then(([agentRes, rulesRes, complianceRes]) => {
        setAgents(agentRes.data?.agents ?? []);
        setRules(rulesRes.data?.rules ?? []);
        setCompliance(complianceRes.data?.records ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const selectedAgent = agents.find((a) => a.id === agentId);

  // Look up the rule for a compliance record to get its metricType
  const ruleById = (ruleId: string) => rules.find((r) => r.id === ruleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/sla-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          providerId: selectedAgent.providerId,
          metricType,
          threshold: parseFloat(threshold),
          windowMinutes: parseInt(windowMinutes, 10),
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setAgentId("");
        setThreshold("");
        setWindowMinutes("60");
        setMetricType("latency");
        fetchRules();
        fetchCompliance();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to create SLA rule");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRule = async (id: string) => {
    await fetch(`${API_BASE}/api/sla-rules/${id}`, { method: "DELETE" });
    fetchRules();
    fetchCompliance();
  };

  const evaluateAgent = async (evalAgentId: string) => {
    setEvaluatingAgent(evalAgentId);
    try {
      await fetch(`${API_BASE}/api/sla-rules/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: evalAgentId }),
      });
      fetchRules();
      fetchCompliance();
    } finally {
      setEvaluatingAgent(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">SLA Compliance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor service-level agreement compliance
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Create Rule
        </button>
      </div>

      {/* Create rule form */}
      {showForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Create SLA Rule</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Agent</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Metric Type</label>
                <select
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value as MetricType)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="latency">Latency</option>
                  <option value="error_rate">Error Rate</option>
                  <option value="uptime">Uptime</option>
                  <option value="throughput">Throughput</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  {metricLabels[metricType]}
                </label>
                <input
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                  placeholder="e.g. 5000"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Window (minutes)</label>
                <input
                  type="number"
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Create Rule
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : rules.length === 0 && !showForm ? (
        <EmptyState
          icon={ShieldCheck}
          title="No SLA rules defined"
          description="Create SLA rules to monitor compliance for your agents. Rules define thresholds for latency, uptime, error rate, and throughput."
        />
      ) : (
        <>
          {/* SLA Rules table */}
          {rules.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-foreground">SLA Rules</h2>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Metric</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Threshold</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Window</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-medium text-foreground">{agentName(rule.agentId)}</td>
                        <td className="px-4 py-3">
                          <MetricBadge type={rule.metricType} />
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {formatThreshold(rule.metricType, rule.threshold)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {rule.windowMinutes}min
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(rule.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => evaluateAgent(rule.agentId)}
                              disabled={evaluatingAgent === rule.agentId}
                              className="flex items-center gap-1 rounded-md bg-accent-blue/10 px-2.5 py-1 text-xs font-medium text-accent-blue transition-colors hover:bg-accent-blue/20 disabled:opacity-50"
                            >
                              {evaluatingAgent === rule.agentId ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Play size={12} />
                              )}
                              Evaluate
                            </button>
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="rounded-md bg-accent-red/10 p-1.5 text-accent-red transition-colors hover:bg-accent-red/20"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Records */}
          {compliance.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">Recent Compliance Checks</h2>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Metric</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Current</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Threshold</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Evaluated</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compliance.map((record) => {
                      const rule = ruleById(record.ruleId);
                      const metric = rule?.metricType ?? "latency";
                      return (
                        <tr key={record.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {agentName(record.agentId)}
                          </td>
                          <td className="px-4 py-3">
                            <MetricBadge type={metric} />
                          </td>
                          <td className="px-4 py-3">
                            <ComplianceBadge status={record.status} />
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {formatThreshold(metric, record.currentValue)}
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {formatThreshold(metric, record.threshold)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(record.evaluatedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {new Date(record.windowStart).toLocaleTimeString()} — {new Date(record.windowEnd).toLocaleTimeString()}
                          </td>
                        </tr>
                      );
                    })}
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
