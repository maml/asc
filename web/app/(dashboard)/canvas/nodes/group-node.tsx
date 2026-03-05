"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { SystemNodeData } from "../lib/canvas-config";

function GroupNodeInner({ data }: NodeProps) {
  const nodeData = data as unknown as SystemNodeData;

  return (
    <div className="h-full w-full rounded-xl border border-dashed border-border bg-transparent p-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {nodeData.label}
      </span>
    </div>
  );
}

export const GroupNode = memo(GroupNodeInner);
