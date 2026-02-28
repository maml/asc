"use client";

import { useEffect, useState, useCallback } from "react";
import { ListTodo, Plus, RefreshCw, X, Clock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Task {
  id: string;
  coordinationId: string;
  agentId: string;
  consumerId: string;
  status: string;
  priority: string;
  input: unknown;
  output?: unknown;
  error?: string;
  attemptCount: number;
  maxAttempts: number;
  timeoutMs: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface Consumer {
  id: string;
  name: string;
  status: string;
}

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={14} className="text-muted-foreground" />,
  in_progress: <Loader2 size={14} className="animate-spin text-accent-blue" />,
  completed: <CheckCircle2 size={14} className="text-accent-green" />,
  failed: <AlertCircle size={14} className="text-accent-red" />,
  cancelled: <X size={14} className="text-muted" />,
};

function formatDuration(start?: string, end?: string): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [consumerId, setConsumerId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [inputJson, setInputJson] = useState('{\n  "message": "Hello, agent!"\n}');

  const fetchTasks = useCallback(() => {
    fetch(`${API_BASE}/api/tasks?limit=50`)
      .then((r) => r.json())
      .then((res) => setTasks(res.data?.tasks ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/tasks?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/agents?limit=50`).then((r) => r.json()),
      fetch(`${API_BASE}/api/consumers?limit=50`).then((r) => r.json()),
    ])
      .then(([taskRes, agentRes, consumerRes]) => {
        setTasks(taskRes.data?.tasks ?? []);
        setAgents(agentRes.data?.agents ?? []);
        setConsumers(consumerRes.data?.consumers ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Poll for task status updates
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(inputJson);
      } catch {
        alert("Invalid JSON input");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/coordinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          consumerId,
          priority,
          input: parsedInput,
        }),
      });

      if (res.ok) {
        setShowForm(false);
        fetchTasks();
      } else {
        const err = await res.json();
        alert(err.error?.message ?? "Failed to submit coordination");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const consumerName = (id: string) => consumers.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active and completed coordination tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            New Request
          </button>
        </div>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="animate-fade-in mb-6 rounded-xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Submit Coordination Request</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Agent</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select agent...</option>
                  {agents
                    .filter((a) => a.status === "active")
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Consumer</label>
                <select
                  value={consumerId}
                  onChange={(e) => setConsumerId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select consumer...</option>
                  {consumers
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Input (JSON)</label>
              <textarea
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                rows={4}
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
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Submit a coordination request to create your first task. Make sure you have active agents and consumers registered."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Task ID</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Consumer</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Attempts</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {statusIcon[task.status] ?? null}
                      <StatusBadge status={task.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{task.id.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{agentName(task.agentId)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{consumerName(task.consumerId)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      task.priority === "critical" ? "text-accent-red" :
                      task.priority === "high" ? "text-accent-yellow" :
                      "text-muted-foreground"
                    }`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {task.attemptCount}/{task.maxAttempts}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDuration(task.startedAt, task.completedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(task.createdAt).toLocaleString()}
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
