"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Workflow, Plus, RefreshCw, Trash2, Play, AlertCircle } from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface PipelineStep {
  name: string;
  agentId: string;
}

interface Pipeline {
  id: string;
  consumerId: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  priority: string;
  createdAt: string;
}

const priorityColor: Record<string, string> = {
  critical: "text-accent-red",
  high: "text-accent-yellow",
  normal: "text-muted-foreground",
  low: "text-muted",
};

export default function PipelinesPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPipelines = useCallback(() => {
    fetch(`${API_BASE}/api/pipelines`)
      .then((r) => r.json())
      .then((res) => {
        setPipelines(res.data?.pipelines ?? []);
        setError(null);
      })
      .catch(() => setError("Failed to fetch pipelines"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this pipeline?")) return;
    await fetch(`${API_BASE}/api/pipelines/${id}`, { method: "DELETE" });
    fetchPipelines();
  };

  const handleExecute = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch(`${API_BASE}/api/pipelines/${id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });
    if (res.ok) {
      router.push(`/pipelines/${id}`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Pipelines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-agent sequential pipelines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPipelines}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <Link
            href="/pipelines/new"
            className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            Create Pipeline
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No pipelines yet"
          description="Create a multi-agent pipeline to chain agents together in sequence."
          actionLabel="Create Pipeline"
          actionHref="/pipelines/new"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Steps</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((pipeline) => (
                <tr key={pipeline.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link href={`/pipelines/${pipeline.id}`} className="text-foreground hover:text-accent-green">
                      {pipeline.name}
                    </Link>
                    {pipeline.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-xs">{pipeline.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{pipeline.steps.length}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${priorityColor[pipeline.priority] ?? "text-muted-foreground"}`}>
                      {pipeline.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(pipeline.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleExecute(pipeline.id, e)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-accent-green"
                        title="Execute"
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(pipeline.id, e)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-accent-red"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
