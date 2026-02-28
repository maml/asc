"use client";

import { useState } from "react";
import { PanelRight, X, Activity } from "lucide-react";
import type { SystemStatus } from "../hooks/use-system-status";

const circuitBadgeStyles: Record<string, string> = {
  closed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  half_open: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  open: "bg-red-500/15 text-red-400 border-red-500/20",
};

// Tiny inline sparkline — no charting lib needed
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const h = 24;
  const w = 80;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MetricsPanelProps {
  status: SystemStatus | null;
  latencyHistory: Record<string, number[]>;
}

export function MetricsPanel({ status, latencyHistory }: MetricsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-surface hover:bg-surface-hover transition-colors"
        title="Metrics Panel"
      >
        <PanelRight size={14} className="text-muted-foreground" />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-0 right-0 z-30 h-full w-80 border-l border-border-subtle bg-surface overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-accent-green" />
              <span className="text-sm font-medium text-foreground">System Metrics</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Backend */}
            <section>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">Backend</h3>
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-3 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-accent-green">{status?.backend.status ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="text-foreground">{status ? formatUptime(status.backend.uptime) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WS Clients</span>
                  <span className="text-foreground">{status?.websocket.connectedClients ?? 0}</span>
                </div>
              </div>
            </section>

            {/* Circuit Breakers */}
            <section>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted mb-2">Circuit Breakers</h3>
              <div className="space-y-2">
                {status?.agents.map((agent) => (
                  <div key={agent.agentId} className="rounded-lg border border-border-subtle bg-surface-raised p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-foreground">{agent.name}</span>
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${circuitBadgeStyles[agent.circuitState] ?? circuitBadgeStyles.closed}`}>
                        {agent.circuitState.replace("_", "-")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                      <span>Latency</span>
                      <div className="flex items-center gap-2">
                        <Sparkline values={latencyHistory[agent.agentId] ?? []} color={agent.healthy ? "#10b981" : "#ef4444"} />
                        <span>{agent.latencyMs}ms</span>
                      </div>
                    </div>
                    <div className="flex justify-between font-mono text-xs text-muted-foreground mt-1">
                      <span>Failures</span>
                      <span>{agent.failureCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
