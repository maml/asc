"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Info } from "lucide-react";
import { statusColors, type SystemNodeData } from "../lib/canvas-config";

const circuitBadgeColors: Record<string, string> = {
  closed: "bg-emerald-500/15 text-emerald-400",
  half_open: "bg-yellow-500/15 text-yellow-400",
  open: "bg-red-500/15 text-red-400",
};

function AgentNodeInner({ data }: NodeProps) {
  const nodeData = data as unknown as SystemNodeData;
  const colors = statusColors[nodeData.status];
  const circuitState = String(nodeData.metrics.circuitState ?? "closed");
  const badgeClass = circuitBadgeColors[circuitState] ?? circuitBadgeColors.closed;

  return (
    <div
      className="rounded-xl border bg-surface px-4 py-3"
      style={{ borderColor: "var(--border-subtle)", borderLeftWidth: 3, borderLeftColor: colors.border, boxShadow: `0 0 20px ${colors.glow}`, minWidth: 140 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bot size={14} className="text-accent-blue" />
        <span className="text-sm font-medium text-foreground truncate">{nodeData.label}</span>
        <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: colors.dot }} />
      </div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {circuitState.replace("_", "-")}
        </span>
        <span className="group relative cursor-help">
          <Info size={10} className="text-muted-foreground/50" />
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 z-50 w-56 rounded-md border border-border-subtle bg-surface-raised px-2.5 py-2 text-[10px] font-normal text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 leading-relaxed">
            <strong className="text-foreground">Circuit breaker</strong> protects against repeated failures.<br />
            <span className="text-emerald-400">Closed</span> = healthy, requests flow normally.<br />
            <span className="text-yellow-400">Half-open</span> = testing if agent recovered.<br />
            <span className="text-red-400">Open</span> = agent down, requests blocked.
          </span>
        </span>
      </div>
      <div className="space-y-1 font-mono text-xs text-muted-foreground">
        <div className="flex justify-between"><span>Success</span><span>{String(nodeData.metrics.successRate ?? "—")}</span></div>
        <div className="flex justify-between"><span>Latency</span><span>{String(nodeData.metrics.avgLatency ?? "—")}</span></div>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-accent-blue !w-2 !h-2 !border-0" />
    </div>
  );
}

export const AgentNode = memo(AgentNodeInner);
