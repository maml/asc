"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { statusColors, type SystemNodeData } from "../lib/canvas-config";

function BackendNodeInner({ data }: NodeProps) {
  const nodeData = data as unknown as SystemNodeData;
  const colors = statusColors[nodeData.status];

  return (
    <div
      className="rounded-xl border bg-surface px-5 py-4"
      style={{ borderColor: "var(--border-subtle)", borderLeftWidth: 3, borderLeftColor: colors.border, boxShadow: `0 0 24px ${colors.glow}`, minWidth: 200 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-green/10">
          <Zap size={14} className="text-accent-green" />
        </div>
        <span className="text-sm font-medium text-foreground">{nodeData.label}</span>
        <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: colors.dot }} />
      </div>
      <div className="space-y-1.5 font-mono text-xs text-muted-foreground">
        <div className="flex justify-between"><span>Active Tasks</span><span className="text-foreground">{String(nodeData.metrics.activeTasks ?? 0)}</span></div>
        <div className="flex justify-between"><span>Events/min</span><span className="text-foreground">{String(nodeData.metrics.eventsPerMin ?? 0)}</span></div>
        <div className="flex justify-between"><span>Uptime</span><span>{String(nodeData.metrics.uptime ?? "0s")}</span></div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-accent-green !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-accent-green !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-accent-green !w-2 !h-2 !border-0" />
    </div>
  );
}

export const BackendNode = memo(BackendNodeInner);
