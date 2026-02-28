"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Users } from "lucide-react";
import { statusColors, type SystemNodeData } from "../lib/canvas-config";

function ConsumerNodeInner({ data }: NodeProps) {
  const nodeData = data as unknown as SystemNodeData;
  const colors = statusColors[nodeData.status];

  return (
    <div
      className="rounded-xl border bg-surface px-4 py-3"
      style={{ borderColor: "var(--border-subtle)", borderLeftWidth: 3, borderLeftColor: colors.border, boxShadow: `0 0 20px ${colors.glow}`, minWidth: 150 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Users size={14} className="text-accent-blue" />
        <span className="text-sm font-medium text-foreground">{nodeData.label}</span>
        <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: colors.dot }} />
      </div>
      <div className="space-y-1 font-mono text-xs text-muted-foreground">
        <div className="flex justify-between"><span>Requests</span><span>{String(nodeData.metrics.requests ?? 0)}</span></div>
        <div className="flex justify-between"><span>Last</span><span>{String(nodeData.metrics.lastRequest ?? "—")}</span></div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-accent-blue !w-2 !h-2 !border-0" />
    </div>
  );
}

export const ConsumerNode = memo(ConsumerNodeInner);
