"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface StepDef {
  name: string;
  agentId: string;
  timeoutMs: string;
  inputMapping: string; // JSON string for advanced editing
}

function emptyStep(): StepDef {
  return { name: "", agentId: "", timeoutMs: "", inputMapping: "" };
}

export default function NewPipelinePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [steps, setSteps] = useState<StepDef[]>([emptyStep()]);

  useEffect(() => {
    fetch(`${API_BASE}/api/agents?limit=100&status=active`)
      .then((r) => r.json())
      .then((res) => setAgents(res.data?.agents ?? []))
      .catch(() => {});
  }, []);

  const updateStep = (index: number, field: keyof StepDef, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const apiSteps = steps.map((s) => {
        const step: Record<string, unknown> = {
          name: s.name,
          agentId: s.agentId,
        };
        if (s.timeoutMs) step.timeoutMs = Number(s.timeoutMs);
        if (s.inputMapping) {
          try {
            step.inputMapping = JSON.parse(s.inputMapping);
          } catch {
            throw new Error(`Invalid JSON in input mapping for step "${s.name}"`);
          }
        }
        return step;
      });

      const res = await fetch(`${API_BASE}/api/pipelines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          priority,
          steps: apiSteps,
        }),
      });

      if (res.ok) {
        const body = await res.json();
        router.push(`/pipelines/${body.data.id}`);
      } else {
        const body = await res.json();
        setError(body.error?.message ?? "Failed to create pipeline");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pipeline");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Create Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a multi-agent pipeline with ordered steps
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="rounded-xl border border-border-subtle bg-surface p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Document Processing Pipeline"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
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

        {/* Steps builder */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Steps</h2>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Plus size={12} />
              Add Step
            </button>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="rounded-xl border border-border-subtle bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green/10 text-[10px] font-semibold text-accent-green">
                      {index + 1}
                    </span>
                    Step {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      disabled={steps.length <= 1}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-accent-red disabled:opacity-30"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Step Name *</label>
                    <input
                      type="text"
                      value={step.name}
                      onChange={(e) => updateStep(index, "name", e.target.value)}
                      required
                      placeholder="e.g. Extract"
                      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Agent *</label>
                    <select
                      value={step.agentId}
                      onChange={(e) => updateStep(index, "agentId", e.target.value)}
                      required
                      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    >
                      <option value="">Select agent...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted">Timeout (ms)</label>
                    <input
                      type="number"
                      value={step.timeoutMs}
                      onChange={(e) => updateStep(index, "timeoutMs", e.target.value)}
                      placeholder="30000"
                      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
                    />
                  </div>
                </div>

                {/* Input mapping (collapsible advanced) */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-muted hover:text-muted-foreground">
                    Input Mapping (advanced)
                  </summary>
                  <textarea
                    value={step.inputMapping}
                    onChange={(e) => updateStep(index, "inputMapping", e.target.value)}
                    rows={2}
                    placeholder='[{"op":"pick","fields":["text"]}]'
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted"
                  />
                </details>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="mt-3 flex justify-center">
                    <div className="h-4 w-px bg-border-subtle" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/pipelines")}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Create Pipeline
          </button>
        </div>
      </form>
    </div>
  );
}
