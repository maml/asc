"use client";

import { memo } from "react";
import { BaseEdge, getStraightPath, type EdgeProps } from "@xyflow/react";

function ConnectionEdgeInner(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, label } = props;
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: "var(--border)", strokeWidth: 1 }} />
      {label && (
        <foreignObject x={labelX - 20} y={labelY - 10} width={40} height={20} className="pointer-events-none">
          <div className="flex h-full items-center justify-center">
            <span className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
              {label}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}

export const ConnectionEdge = memo(ConnectionEdgeInner);
