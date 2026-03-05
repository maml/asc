"use client";

import { memo, useEffect, useRef } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

function DataFlowEdgeInner(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const circleRef = useRef<SVGCircleElement>(null);
  const animRef = useRef<number>(0);
  const progressRef = useRef(0);

  const isActive = (data as Record<string, unknown> | undefined)?.active === true;
  const flowColor = (data as Record<string, unknown> | undefined)?.color as string | undefined;
  const color = flowColor ?? "var(--accent-blue)";

  useEffect(() => {
    if (!isActive || !circleRef.current) {
      progressRef.current = 0;
      return;
    }

    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", edgePath);
    const totalLength = pathEl.getTotalLength();
    const duration = 800; // ms per edge traversal

    let startTime: number | null = null;

    function animate(time: number) {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const t = (elapsed % duration) / duration;
      const point = pathEl.getPointAtLength(t * totalLength);

      if (circleRef.current) {
        circleRef.current.setAttribute("cx", String(point.x));
        circleRef.current.setAttribute("cy", String(point.y));
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isActive, edgePath]);

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: isActive ? color : "rgba(148, 163, 184, 0.6)",
          strokeWidth: isActive ? 2 : 1.5,
          opacity: isActive ? 0.9 : 1,
          transition: "stroke 300ms, opacity 300ms",
        }}
      />
      {isActive && (
        <circle
          ref={circleRef}
          r={4}
          fill={color}
          className="particle-pulse"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
      {props.label && (
        <foreignObject x={labelX - 20} y={labelY - 10} width={40} height={20} className="pointer-events-none">
          <div className="flex h-full items-center justify-center">
            <span className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
              {props.label}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}

export const DataFlowEdge = memo(DataFlowEdgeInner);
