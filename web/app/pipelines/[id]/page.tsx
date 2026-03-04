"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Play, Trash2, Clock, CheckCircle2, AlertCircle, Loader2, X,
  ChevronDown, ChevronRight,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface PipelineStep {
  name: string;
  agentId: string;
  timeoutMs?: number;
  inputMapping?: unknown[];
}

interface Pipeline {
  id: string;
  consumerId: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  priority: string;
  metadata: Record<string, string>;
  createdAt: string;
}

interface Execution {
  id: string;
  pipelineId: string;
  status: string;
  input: unknown;
  output?: unknown;
  error?: string;
  currentStepIndex: number;
  totalSteps: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const statusDisplay: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending:   { icon: <Clock size={14} />,                                label: "Pending",   color: "text-muted-foreground" },
  running:   { icon: <Loader2 size={14} className="animate-spin" />,     label: "Running",   color: "text-accent-blue" },
  completed: { icon: <CheckCircle2 size={14} />,                         label: "Completed", color: "text-accent-green" },
  failed:    { icon: <AlertCircle size={14} />,                          label: "Failed",    color: "text-accent-red" },
};
const defaultStatus = { icon: <Clock size={14} />, label: "Unknown", color: "text-muted-foreground" };

const priorityColor: Record<string, string> = {
  critical: "text-accent-red",
  high: "text-accent-yellow",
  normal: "text-muted-foreground",
  low: "text-muted",
};

function formatDuration(start?: string, end?: string): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExecuteForm, setShowExecuteForm] = useState(false);
  const [inputJson, setInputJson] = useState("{}");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/api/pipelines/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/pipelines/${id}/executions`).then((r) => r.json()),
    ])
      .then(([pipelineRes, execRes]) => {
        setPipeline(pipelineRes.data ?? null);
        setExecutions(execRes.data?.executions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
    // Poll while any execution is running
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/pipelines/${id}/executions`)
        .then((r) => r.json())
        .then((res) => setExecutions(res.data?.executions ?? []))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, id]);

  const handleDelete = async () => {
    if (!confirm("Delete this pipeline and all its data?")) return;
    await fetch(`${API_BASE}/api/pipelines/${id}`, { method: "DELETE" });
    router.push("/pipelines");
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(inputJson);
      } catch {
        alert("Invalid JSON");
        setSubmitting(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/pipelines/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: parsedInput }),
      });
      if (res.ok) {
        setShowExecuteForm(false);
        fetchData();
      } else {
        const body = await res.json();
        alert(body.error?.message ?? "Failed to execute");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!pipeline) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Pipeline not found.{" "}
        <Link href="/pipelines" className="text-accent-green hover:underline">Back to pipelines</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/pipelines" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} />
          Back to Pipelines
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{pipeline.name}</h1>
            {pipeline.description && (
              <p className="mt-1 text-sm text-muted-foreground">{pipeline.description}</p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""}</span>
              <span className={priorityColor[pipeline.priority] ?? "text-muted-foreground"}>
                {pipeline.priority} priority
              </span>
              <span>Created {new Date(pipeline.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExecuteForm(!showExecuteForm)}
              className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Play size={14} />
              Execute
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-accent-red"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Execute form */}
      {showExecuteForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Execute Pipeline</h3>
            <button onClick={() => setShowExecuteForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleExecute} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Input (JSON)</label>
              <textarea
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Start Execution
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Steps definition */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-foreground">Pipeline Steps</h2>
        <div className="space-y-1">
          {pipeline.steps.map((step, i) => (
            <div key={i}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-green/10 text-[11px] font-semibold text-accent-green">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <span className="text-sm text-foreground">{step.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{step.agentId.slice(0, 8)}</span>
                </div>
                {step.timeoutMs && (
                  <span className="text-xs text-muted">{step.timeoutMs}ms timeout</span>
                )}
                {step.inputMapping && step.inputMapping.length > 0 && (
                  <span className="text-xs text-muted">mapped</span>
                )}
              </div>
              {i < pipeline.steps.length - 1 && (
                <div className="ml-[22px] h-3 border-l border-border-subtle" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execution History */}
      <div className="rounded-xl border border-border-subtle">
        <div className="border-b border-border-subtle bg-surface px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">Execution History</h2>
        </div>
        {executions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No executions yet. Click "Execute" to run this pipeline.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Execution ID</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Progress</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Started</th>
                <th className="w-8 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => {
                const st = statusDisplay[exec.status] ?? defaultStatus;
                return (
                  <tr key={exec.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${st.color}`}>
                        {st.icon}
                        {st.label}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{exec.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {exec.status === "completed" ? exec.totalSteps : exec.currentStepIndex}/{exec.totalSteps}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDuration(exec.startedAt, exec.completedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/pipelines/${id}/executions/${exec.id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
