"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Clock, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface Execution {
  id: string;
  pipelineId: string;
  traceId: string;
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

interface StepExecution {
  executionId: string;
  stepIndex: number;
  stepName: string;
  agentId: string;
  coordinationId?: string;
  taskId?: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface PipelineEvent {
  executionId: string;
  traceId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const stepStatusConfig: Record<string, { icon: React.ReactNode; label: string; color: string; barColor: string }> = {
  pending:   { icon: <Clock size={14} />,                                label: "Pending",   color: "text-muted-foreground", barColor: "bg-muted" },
  running:   { icon: <Loader2 size={14} className="animate-spin" />,     label: "Running",   color: "text-accent-blue",      barColor: "bg-accent-blue" },
  completed: { icon: <CheckCircle2 size={14} />,                         label: "Completed", color: "text-accent-green",     barColor: "bg-[#10b981]" },
  failed:    { icon: <AlertCircle size={14} />,                          label: "Failed",    color: "text-accent-red",       barColor: "bg-[#ef4444]" },
  skipped:   { icon: <Clock size={14} />,                                label: "Skipped",   color: "text-muted",            barColor: "bg-muted" },
};
const defaultStepStatus = { icon: <Clock size={14} />, label: "Unknown", color: "text-muted-foreground", barColor: "bg-muted" };

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return formatMs(e - s);
}

const eventTypeLabel: Record<string, { label: string; color: string }> = {
  pipeline_started:        { label: "Started",        color: "bg-accent-blue/10 text-accent-blue" },
  pipeline_step_started:   { label: "Step Started",   color: "bg-accent-blue/10 text-accent-blue" },
  pipeline_step_completed: { label: "Step Completed", color: "bg-accent-green/10 text-accent-green" },
  pipeline_step_failed:    { label: "Step Failed",    color: "bg-accent-red/10 text-accent-red" },
  pipeline_completed:      { label: "Completed",      color: "bg-accent-green/10 text-accent-green" },
  pipeline_failed:         { label: "Failed",         color: "bg-accent-red/10 text-accent-red" },
};

export default function ExecutionDetailPage() {
  const params = useParams();
  const pipelineId = params.id as string;
  const execId = params.execId as string;

  const [execution, setExecution] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<StepExecution[]>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEvents, setShowEvents] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/api/pipeline-executions/${execId}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/pipeline-executions/${execId}/steps`).then((r) => r.json()),
      fetch(`${API_BASE}/api/pipeline-executions/${execId}/events`).then((r) => r.json()),
    ])
      .then(([execRes, stepsRes, eventsRes]) => {
        setExecution(execRes.data ?? null);
        setSteps(stepsRes.data?.steps ?? []);
        setEvents(eventsRes.data?.events ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [execId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while running
  useEffect(() => {
    if (!execution || execution.status === "completed" || execution.status === "failed") return;
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [execution?.status, fetchData]);

  // Waterfall timing
  const { totalDuration, startMs } = useMemo(() => {
    if (!execution?.startedAt) return { totalDuration: 1, startMs: 0 };
    const start = new Date(execution.startedAt).getTime();
    let maxEnd = start;
    for (const step of steps) {
      if (step.completedAt) {
        const end = new Date(step.completedAt).getTime();
        if (end > maxEnd) maxEnd = end;
      } else if (step.startedAt) {
        maxEnd = Math.max(maxEnd, Date.now());
      }
    }
    if (execution.completedAt) {
      maxEnd = Math.max(maxEnd, new Date(execution.completedAt).getTime());
    }
    return { totalDuration: Math.max(maxEnd - start, 1), startMs: start };
  }, [execution, steps]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!execution) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Execution not found.{" "}
        <Link href={`/pipelines/${pipelineId}`} className="text-accent-green hover:underline">Back to pipeline</Link>
      </div>
    );
  }

  const execStatus = stepStatusConfig[execution.status] ?? defaultStepStatus;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/pipelines/${pipelineId}`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} />
          Back to Pipeline
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Execution</h1>
              <div className={`flex items-center gap-1.5 text-sm font-medium ${execStatus.color}`}>
                {execStatus.icon}
                {execStatus.label}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>ID: <span className="font-mono">{execution.id.slice(0, 12)}</span></span>
              <span>Trace: <span className="font-mono">{execution.traceId.slice(0, 12)}</span></span>
              <span>Duration: {formatDuration(execution.startedAt, execution.completedAt)}</span>
              <span>Progress: {execution.status === "completed" ? execution.totalSteps : execution.currentStepIndex}/{execution.totalSteps}</span>
            </div>
          </div>
        </div>

        {execution.error && (
          <div className="mt-3 rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
            {execution.error}
          </div>
        )}
      </div>

      {/* Step Timeline */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">Step Timeline</h2>
        </div>

        {/* Waterfall header */}
        <div className="flex items-center px-5 pt-3 text-[10px] text-muted">
          <div className="w-[240px] shrink-0" />
          <div className="relative flex-1">
            <span className="absolute left-0">0ms</span>
            <span className="absolute left-1/4 -translate-x-1/2">{formatMs(totalDuration * 0.25)}</span>
            <span className="absolute left-1/2 -translate-x-1/2">{formatMs(totalDuration * 0.5)}</span>
            <span className="absolute left-3/4 -translate-x-1/2">{formatMs(totalDuration * 0.75)}</span>
            <span className="absolute right-0">{formatMs(totalDuration)}</span>
          </div>
        </div>

        <div className="px-5 py-3 space-y-0.5">
          {steps.map((step) => {
            const sc = stepStatusConfig[step.status] ?? defaultStepStatus;
            const isExpanded = expandedStep === step.stepIndex;

            // Waterfall bar positioning
            let offsetPercent = 0;
            let widthPercent = 0;
            if (step.startedAt) {
              const stepStart = new Date(step.startedAt).getTime();
              const stepEnd = step.completedAt ? new Date(step.completedAt).getTime() : Date.now();
              offsetPercent = ((stepStart - startMs) / totalDuration) * 100;
              widthPercent = ((stepEnd - stepStart) / totalDuration) * 100;
            }

            return (
              <div key={step.stepIndex}>
                <div
                  className="group flex items-center rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-surface-hover"
                  onClick={() => setExpandedStep(isExpanded ? null : step.stepIndex)}
                >
                  {/* Step info */}
                  <div className="w-[240px] shrink-0 flex items-center gap-2 overflow-hidden">
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    <span className={`flex items-center gap-1.5 ${sc.color}`}>
                      {sc.icon}
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised text-[10px] font-semibold text-muted-foreground">
                      {step.stepIndex + 1}
                    </span>
                    <span className="truncate text-xs text-foreground">{step.stepName}</span>
                    <span className="font-mono text-[10px] text-muted">{step.agentId.slice(0, 6)}</span>
                  </div>

                  {/* Waterfall bar */}
                  <div className="relative flex-1 h-5">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      <div className="h-full w-1/4 border-r border-border-subtle" />
                      <div className="h-full w-1/4 border-r border-border-subtle" />
                      <div className="h-full w-1/4 border-r border-border-subtle" />
                      <div className="h-full w-1/4" />
                    </div>

                    {step.startedAt && (
                      <>
                        <div
                          className={`absolute top-1 h-3 rounded-sm ${sc.barColor}`}
                          style={{
                            left: `${offsetPercent}%`,
                            width: `${Math.max(widthPercent, 0.3)}%`,
                            minWidth: "2px",
                          }}
                        />
                        <span
                          className="absolute top-0.5 text-[10px] font-mono text-muted-foreground"
                          style={{
                            left: `${Math.min(offsetPercent + widthPercent + 0.5, 90)}%`,
                          }}
                        >
                          {step.durationMs != null ? formatMs(step.durationMs) : "..."}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-10 mb-2 rounded-lg bg-background/50 px-4 py-3 text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted">Agent: </span>
                        <span className="font-mono text-muted-foreground">{step.agentId.slice(0, 12)}</span>
                      </div>
                      {step.coordinationId && (
                        <div>
                          <span className="text-muted">Coordination: </span>
                          <span className="font-mono text-muted-foreground">{step.coordinationId.slice(0, 12)}</span>
                        </div>
                      )}
                      {step.taskId && (
                        <div>
                          <span className="text-muted">Task: </span>
                          <span className="font-mono text-muted-foreground">{step.taskId.slice(0, 12)}</span>
                        </div>
                      )}
                      {step.durationMs != null && (
                        <div>
                          <span className="text-muted">Duration: </span>
                          <span className="text-muted-foreground">{formatMs(step.durationMs)}</span>
                        </div>
                      )}
                    </div>
                    {step.error && (
                      <div className="rounded border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-accent-red">
                        {step.error}
                      </div>
                    )}
                    {step.input != null && (
                      <div>
                        <span className="text-muted">Input:</span>
                        <pre className="mt-1 max-h-24 overflow-auto rounded bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {JSON.stringify(step.input, null, 2)}
                        </pre>
                      </div>
                    )}
                    {step.output != null && (
                      <div>
                        <span className="text-muted">Output:</span>
                        <pre className="mt-1 max-h-24 overflow-auto rounded bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Events Feed (collapsible) */}
      <div className="rounded-xl border border-border-subtle bg-surface">
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="flex w-full items-center justify-between border-b border-border-subtle px-5 py-3 text-left transition-colors hover:bg-surface-hover"
        >
          <h2 className="text-sm font-medium text-foreground">
            Events ({events.length})
          </h2>
          {showEvents ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </button>

        {showEvents && (
          <div className="px-5 py-3">
            {events.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-1">
                {events.map((event, i) => {
                  const type = event.payload.type as string;
                  const typeConfig = eventTypeLabel[type] ?? { label: type, color: "bg-surface-raised text-muted-foreground" };
                  return (
                    <div key={i} className="flex items-center gap-3 rounded px-2 py-1.5 text-xs transition-colors hover:bg-surface-hover">
                      <span className="w-20 shrink-0 font-mono text-muted">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {event.payload.stepName ? String(event.payload.stepName) : null}
                        {event.payload.error ? ` — ${String(event.payload.error)}` : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
