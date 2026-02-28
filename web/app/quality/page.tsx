"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Gauge,
  Plus,
  X,
  Loader2,
  Trash2,
  ShieldCheck,
  CheckCircle,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Agent {
  id: string;
  name: string;
}

interface QualityGate {
  id: string;
  agentId: string;
  name: string;
  description: string;
  checkConfig: { type: string; [key: string]: unknown };
  required: boolean;
  createdAt: string;
}

interface QualityCheckRecord {
  id: string;
  gateId: string;
  taskId: string;
  result: "pass" | "fail" | "skip" | "error";
  message?: string;
  durationMs?: number;
  checkedAt: string;
}

type CheckType = "json_schema" | "latency_threshold" | "output_regex" | "custom_webhook";

const checkTypeBadgeColors: Record<CheckType, { bg: string; text: string }> = {
  json_schema: { bg: "bg-accent-blue/10", text: "text-accent-blue" },
  latency_threshold: { bg: "bg-amber-500/10", text: "text-amber-500" },
  output_regex: { bg: "bg-[#a855f7]/10", text: "text-[#a855f7]" },
  custom_webhook: { bg: "bg-muted/10", text: "text-muted-foreground" },
};

const resultColors: Record<QualityCheckRecord["result"], { bg: string; text: string; icon: typeof CheckCircle }> = {
  pass: { bg: "bg-accent-green/10", text: "text-accent-green", icon: CheckCircle },
  fail: { bg: "bg-accent-red/10", text: "text-accent-red", icon: XCircle },
  skip: { bg: "bg-muted/10", text: "text-muted-foreground", icon: MinusCircle },
  error: { bg: "bg-amber-500/10", text: "text-amber-500", icon: XCircle },
};

function CheckTypeBadge({ type }: { type: string }) {
  const colors = checkTypeBadgeColors[type as CheckType] ?? checkTypeBadgeColors.custom_webhook;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ResultBadge({ result }: { result: QualityCheckRecord["result"] }) {
  const style = resultColors[result];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <Icon size={12} />
      {result}
    </span>
  );
}

export default function QualityPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [checks, setChecks] = useState<QualityCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [checkType, setCheckType] = useState<CheckType>("json_schema");
  const [required, setRequired] = useState(false);

  // Dynamic config fields
  const [maxLatencyMs, setMaxLatencyMs] = useState("5000");
  const [regexPattern, setRegexPattern] = useState("");
  const [regexFlags, setRegexFlags] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const fetchGates = useCallback(() => {
    fetch(`${API_BASE}/api/quality-gates?limit=50`)
      .then((r) => r.json())
      .then((res) => setGates(res.data?.gates ?? []))
      .catch(() => {});
  }, []);

  const fetchChecks = useCallback(() => {
    fetch(`${API_BASE}/api/quality-checks?limit=30`)
      .then((r) => r.json())
      .then((res) => setChecks(res.data?.checks ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/agents?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/quality-gates?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/quality-checks?limit=30`).then((r) => r.json()),
    ])
      .then(([agentRes, gatesRes, checksRes]) => {
        setAgents(agentRes.data?.agents ?? []);
        setGates(gatesRes.data?.gates ?? []);
        setChecks(checksRes.data?.checks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const gateName = (id: string) => gates.find((g) => g.id === id)?.name ?? id;

  const buildCheckConfig = (): QualityGate["checkConfig"] => {
    switch (checkType) {
      case "json_schema":
        return { type: "json_schema" };
      case "latency_threshold":
        return { type: "latency_threshold", maxMs: parseInt(maxLatencyMs, 10) };
      case "output_regex":
        return { type: "output_regex", pattern: regexPattern, flags: regexFlags || undefined };
      case "custom_webhook":
        return { type: "custom_webhook", url: webhookUrl };
    }
  };

  const resetForm = () => {
    setAgentId("");
    setName("");
    setDescription("");
    setCheckType("json_schema");
    setRequired(false);
    setMaxLatencyMs("5000");
    setRegexPattern("");
    setRegexFlags("");
    setWebhookUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/quality-gates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name,
          description,
          checkConfig: buildCheckConfig(),
          required,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        resetForm();
        fetchGates();
        fetchChecks();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to create quality gate");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteGate = async (id: string) => {
    await fetch(`${API_BASE}/api/quality-gates/${id}`, { method: "DELETE" });
    fetchGates();
    fetchChecks();
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Quality Gates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Validate outputs and enforce quality standards
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          Create Gate
        </button>
      </div>

      {/* Create gate form */}
      {showForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Create Quality Gate</h3>
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
                <label className="mb-1.5 block text-xs text-muted-foreground">Gate Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Response Format Check"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Validates that output matches the expected format"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Check Type</label>
                <select
                  value={checkType}
                  onChange={(e) => setCheckType(e.target.value as CheckType)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="json_schema">JSON Schema</option>
                  <option value="latency_threshold">Latency Threshold</option>
                  <option value="output_regex">Output Regex</option>
                  <option value="custom_webhook">Custom Webhook</option>
                </select>
              </div>
              {/* Dynamic config fields based on check type */}
              <div>
                {checkType === "json_schema" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">JSON Schema</label>
                    <p className="mt-1 rounded-lg border border-border-subtle bg-background px-3 py-2 text-xs text-muted-foreground">
                      V1: validates output is valid JSON
                    </p>
                  </div>
                )}
                {checkType === "latency_threshold" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">Max Latency (ms)</label>
                    <input
                      type="number"
                      value={maxLatencyMs}
                      onChange={(e) => setMaxLatencyMs(e.target.value)}
                      required
                      placeholder="5000"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
                    />
                  </div>
                )}
                {checkType === "output_regex" && (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1.5 block text-xs text-muted-foreground">Pattern</label>
                      <input
                        type="text"
                        value={regexPattern}
                        onChange={(e) => setRegexPattern(e.target.value)}
                        required
                        placeholder="^\\{.*\\}$"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-muted-foreground">Flags</label>
                      <input
                        type="text"
                        value={regexFlags}
                        onChange={(e) => setRegexFlags(e.target.value)}
                        placeholder="i"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
                      />
                    </div>
                  </div>
                )}
                {checkType === "custom_webhook" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">Webhook URL</label>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/validate"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted"
                    />
                    <p className="mt-1 text-[11px] text-muted">Coming soon</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="rounded border-border"
                />
                <ShieldCheck size={14} className="text-accent-red" />
                Block task completion if this gate fails
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Create Gate
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : gates.length === 0 && !showForm ? (
        <EmptyState
          icon={Gauge}
          title="No quality gates defined"
          description="Create quality gates to validate agent outputs and enforce standards. Gates can check JSON format, latency thresholds, output patterns, and more."
        />
      ) : (
        <>
          {/* Quality Gates grid */}
          {gates.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-foreground">Quality Gates</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {gates.map((gate) => (
                  <div key={gate.id} className="card-hover rounded-xl border border-border-subtle bg-surface p-5">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10">
                          <Gauge size={16} className="text-accent-blue" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-foreground">{gate.name}</h3>
                          <p className="text-[11px] text-muted">{agentName(gate.agentId)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteGate(gate.id)}
                        className="rounded-md bg-accent-red/10 p-1.5 text-accent-red transition-colors hover:bg-accent-red/20"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {gate.description && (
                      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{gate.description}</p>
                    )}
                    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
                      <CheckTypeBadge type={gate.checkConfig.type} />
                      {gate.required ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent-red/10 px-2 py-0.5 text-[11px] font-medium text-accent-red">
                          <ShieldCheck size={10} />
                          Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-muted/10 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Check Results */}
          {checks.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">Recent Check Results</h2>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface">
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Gate</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Task ID</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Result</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Message</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Duration</th>
                      <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((check) => (
                      <tr key={check.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {gateName(check.gateId)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {check.taskId.length > 12 ? `${check.taskId.slice(0, 12)}...` : check.taskId}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ResultBadge result={check.result} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {check.message ? (
                            <span className="line-clamp-1 max-w-[200px]">{check.message}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {check.durationMs != null ? `${check.durationMs}ms` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(check.checkedAt).toLocaleString()}
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
