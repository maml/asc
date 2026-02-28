"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { GitBranch, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { EmptyState } from "../components/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

interface SpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  status: "ok" | "error" | "timeout";
  startTime: string;
  endTime?: string;
  durationMs?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

interface Trace {
  traceId: string;
  coordinationId: string;
  rootSpanId?: string;
  spans: Span[];
  startTime: string;
  endTime?: string;
  metadata: Record<string, unknown>;
}

type TraceStatus = "ok" | "error" | "in_progress";

function getTraceStatus(trace: Trace): TraceStatus {
  if (!trace.endTime) return "in_progress";
  if (trace.spans.some((s) => s.status === "error" || s.status === "timeout")) return "error";
  return "ok";
}

const statusDot: Record<TraceStatus, string> = {
  ok: "bg-[#10b981]",
  error: "bg-[#ef4444]",
  in_progress: "bg-[#f59e0b]",
};

const statusLabel: Record<TraceStatus, string> = {
  ok: "OK",
  error: "Error",
  in_progress: "In progress",
};

function formatDuration(startTime: string, endTime?: string): string {
  const s = new Date(startTime).getTime();
  const e = endTime ? new Date(endTime).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// Build a depth-first ordered list of spans respecting parent-child hierarchy
function buildSpanTree(spans: Span[], rootSpanId?: string): { span: Span; depth: number }[] {
  const childrenMap = new Map<string, Span[]>();
  let rootSpans: Span[] = [];

  for (const span of spans) {
    if (span.parentSpanId) {
      const siblings = childrenMap.get(span.parentSpanId) ?? [];
      siblings.push(span);
      childrenMap.set(span.parentSpanId, siblings);
    }
  }

  // Find root spans: either the designated root, or spans with no parent
  if (rootSpanId) {
    const root = spans.find((s) => s.spanId === rootSpanId);
    if (root) rootSpans = [root];
  }
  if (rootSpans.length === 0) {
    rootSpans = spans.filter((s) => !s.parentSpanId || !spans.some((p) => p.spanId === s.parentSpanId));
  }

  // Sort children by startTime
  for (const [, children] of childrenMap) {
    children.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }
  rootSpans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const result: { span: Span; depth: number }[] = [];
  function walk(span: Span, depth: number) {
    result.push({ span, depth });
    const children = childrenMap.get(span.spanId) ?? [];
    for (const child of children) {
      walk(child, depth + 1);
    }
  }
  for (const root of rootSpans) {
    walk(root, 0);
  }

  return result;
}

// Waterfall visualization for a single trace
function TraceWaterfall({ trace }: { trace: Trace }) {
  const traceStartMs = new Date(trace.startTime).getTime();
  const traceDuration = useMemo(() => {
    let maxEnd = traceStartMs;
    for (const span of trace.spans) {
      const end = span.endTime ? new Date(span.endTime).getTime() : Date.now();
      if (end > maxEnd) maxEnd = end;
    }
    return Math.max(maxEnd - traceStartMs, 1); // avoid div by zero
  }, [trace, traceStartMs]);

  const orderedSpans = useMemo(
    () => buildSpanTree(trace.spans, trace.rootSpanId),
    [trace.spans, trace.rootSpanId],
  );

  const spanBarColor: Record<string, string> = {
    ok: "bg-[#10b981]",
    error: "bg-[#ef4444]",
    timeout: "bg-[#f59e0b]",
  };

  return (
    <div className="space-y-0.5">
      {/* Timeline header */}
      <div className="mb-2 flex items-center text-[10px] text-muted">
        <div className="w-[260px] shrink-0" />
        <div className="relative flex-1">
          <span className="absolute left-0">0ms</span>
          <span className="absolute left-1/4 -translate-x-1/2">{formatMs(traceDuration * 0.25)}</span>
          <span className="absolute left-1/2 -translate-x-1/2">{formatMs(traceDuration * 0.5)}</span>
          <span className="absolute left-3/4 -translate-x-1/2">{formatMs(traceDuration * 0.75)}</span>
          <span className="absolute right-0">{formatMs(traceDuration)}</span>
        </div>
      </div>

      {orderedSpans.map(({ span, depth }) => {
        const spanStart = new Date(span.startTime).getTime();
        const spanEnd = span.endTime ? new Date(span.endTime).getTime() : Date.now();
        const spanDuration = spanEnd - spanStart;
        const offsetPercent = ((spanStart - traceStartMs) / traceDuration) * 100;
        const widthPercent = (spanDuration / traceDuration) * 100;

        return (
          <div key={span.spanId} className="group flex items-center rounded px-2 py-1 transition-colors hover:bg-surface-hover">
            {/* Operation name with indentation */}
            <div className="w-[260px] shrink-0 flex items-center gap-1.5 overflow-hidden">
              <div style={{ width: depth * 16 }} className="shrink-0" />
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${spanBarColor[span.status] ?? "bg-muted"}`}
              />
              <span className="truncate text-xs text-foreground" title={span.operationName}>
                {span.operationName}
              </span>
            </div>

            {/* Timeline bar */}
            <div className="relative flex-1 h-5">
              {/* Grid lines */}
              <div className="absolute inset-0 flex">
                <div className="h-full w-1/4 border-r border-border-subtle" />
                <div className="h-full w-1/4 border-r border-border-subtle" />
                <div className="h-full w-1/4 border-r border-border-subtle" />
                <div className="h-full w-1/4" />
              </div>

              {/* Span bar */}
              <div
                className={`absolute top-1 h-3 rounded-sm ${spanBarColor[span.status] ?? "bg-muted"}`}
                style={{
                  left: `${offsetPercent}%`,
                  width: `${Math.max(widthPercent, 0.3)}%`,
                  minWidth: "2px",
                }}
              />

              {/* Duration label */}
              <span
                className="absolute top-0.5 text-[10px] font-mono text-muted-foreground"
                style={{
                  left: `${Math.min(offsetPercent + widthPercent + 0.5, 90)}%`,
                }}
              >
                {span.durationMs != null ? formatMs(span.durationMs) : formatMs(spanDuration)}
              </span>
            </div>
          </div>
        );
      })}

      {/* Span detail section: attributes/events summary */}
      {trace.spans.some((s) => s.events.length > 0) && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">Span Events</p>
          <div className="space-y-0.5">
            {trace.spans
              .flatMap((s) =>
                s.events.map((ev) => ({
                  spanOp: s.operationName,
                  name: ev.name,
                  timestamp: ev.timestamp,
                })),
              )
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              .slice(0, 20)
              .map((ev, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-0.5 text-[11px]">
                  <span className="w-20 shrink-0 font-mono text-muted">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-muted-foreground">{ev.spanOp}</span>
                  <span className="text-foreground">{ev.name}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);

  const fetchTraces = () => {
    fetch(`${API_BASE}/api/traces?limit=20`)
      .then((r) => r.json())
      .then((res) => {
        setTraces(res.data?.traces ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTraces();
  }, []);

  const toggleTrace = (traceId: string) => {
    setExpandedTraceId((prev) => (prev === traceId ? null : traceId));
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Traces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Distributed execution traces
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchTraces();
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading...</div>
      ) : traces.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No traces yet"
          description="Traces are generated automatically when coordination requests are processed. Submit a task to see execution traces."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Coordination</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Spans</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Duration</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => {
                const status = getTraceStatus(trace);
                const isExpanded = expandedTraceId === trace.traceId;

                return (
                  <Fragment key={trace.traceId}>
                    <tr
                      onClick={() => toggleTrace(trace.traceId)}
                      className="cursor-pointer border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-3 py-3 text-muted-foreground">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {trace.coordinationId.slice(0, 12)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {trace.spans.length}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatDuration(trace.startTime, trace.endTime)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${statusDot[status]}`} />
                          {statusLabel[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(trace.startTime).toLocaleString()}
                      </td>
                    </tr>

                    {/* Expanded waterfall row */}
                    {isExpanded && (
                      <tr className="border-b border-border-subtle last:border-0">
                        <td colSpan={6} className="bg-background/50 px-6 py-4">
                          <div className="mb-3 flex items-center gap-3 text-xs text-muted">
                            <span>
                              Trace <span className="font-mono text-muted-foreground">{trace.traceId.slice(0, 12)}</span>
                            </span>
                            <span className="text-border-subtle">|</span>
                            <span>{trace.spans.length} span{trace.spans.length !== 1 ? "s" : ""}</span>
                            <span className="text-border-subtle">|</span>
                            <span>{formatDuration(trace.startTime, trace.endTime)} total</span>
                          </div>
                          <TraceWaterfall trace={trace} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

