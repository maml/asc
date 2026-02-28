"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  initialNodes,
  initialEdges,
  type SystemNodeData,
  type NodeStatus,
} from "./lib/canvas-config";
import { AnimationEngine } from "./lib/animation-engine";
import { applyStoredPositions, useCanvasLayout } from "./hooks/use-canvas-layout";
import { useWebSocket } from "./hooks/use-websocket";
import { useSystemStatus } from "./hooks/use-system-status";

import { ConsumerNode } from "./nodes/consumer-node";
import { BackendNode } from "./nodes/backend-node";
import { AgentNode } from "./nodes/agent-node";
import { PostgresNode } from "./nodes/postgres-node";
import { GroupNode } from "./nodes/group-node";

import { ConnectionEdge } from "./edges/connection-edge";
import { DataFlowEdge } from "./edges/data-flow-edge";

import { MetricsPanel } from "./overlays/metrics-panel";
import { EventTimeline } from "./overlays/event-timeline";

const nodeTypes: NodeTypes = {
  consumer: ConsumerNode,
  backend: BackendNode,
  agent: AgentNode,
  postgres: PostgresNode,
  group: GroupNode,
};

const edgeTypes: EdgeTypes = {
  connection: ConnectionEdge,
  dataFlow: DataFlowEdge,
};

export function CanvasView() {
  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(() =>
    applyStoredPositions(initialNodes)
  );
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const engineRef = useRef(new AnimationEngine());
  const { savePositions } = useCanvasLayout();
  const { lastEvent, isConnected, events } = useWebSocket();
  const { status } = useSystemStatus(5000);
  const [latencyHistory, setLatencyHistory] = useState<Record<string, number[]>>({});

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds) as Node<SystemNodeData>[];
        savePositions(changes, updated);
        return updated;
      });
    },
    [savePositions]
  );

  // Update nodes from system status polling
  useEffect(() => {
    if (!status) return;

    // Track latency history for sparklines
    setLatencyHistory((prev) => {
      const next = { ...prev };
      for (const agent of status.agents) {
        const history = next[agent.agentId] ?? [];
        next[agent.agentId] = [...history.slice(-19), agent.latencyMs];
      }
      return next;
    });

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === "backend") {
          return {
            ...node,
            data: {
              ...node.data,
              status: "healthy" as NodeStatus,
              metrics: {
                ...node.data.metrics,
                uptime: formatUptime(status.backend.uptime),
              },
            },
          };
        }

        if (node.id === "postgres") {
          return {
            ...node,
            data: {
              ...node.data,
              status: (status.database.status === "ok" ? "healthy" : "unhealthy") as NodeStatus,
              metrics: { connection: status.database.status === "ok" ? "connected" : "disconnected" },
            },
          };
        }

        // Agent nodes
        const agentStatus = status.agents.find((a) => a.agentId === node.id);
        if (agentStatus) {
          const nodeStatus: NodeStatus = agentStatus.circuitState === "open"
            ? "unhealthy"
            : agentStatus.circuitState === "half_open"
              ? "degraded"
              : agentStatus.healthy
                ? "healthy"
                : "unknown";

          return {
            ...node,
            data: {
              ...node.data,
              status: nodeStatus,
              metrics: {
                circuitState: agentStatus.circuitState,
                successRate: agentStatus.healthy ? "ok" : "down",
                avgLatency: `${agentStatus.latencyMs}ms`,
              },
            },
          };
        }

        return node;
      })
    );
  }, [status]);

  // Handle WebSocket events — drive animation engine
  useEffect(() => {
    if (!lastEvent) return;

    const payload = lastEvent.payload;
    const taskId = payload.taskId as string | undefined;
    const agentId = payload.agentId as string | undefined;

    switch (lastEvent.type) {
      case "task_started":
        if (taskId && agentId) {
          engineRef.current.startFlow(taskId, agentId);
        }
        break;
      case "task_completed":
        if (taskId) engineRef.current.completeFlow(taskId);
        break;
      case "task_failed":
      case "task_timeout":
        if (taskId) engineRef.current.failFlow(taskId);
        break;
      case "circuit_state_change": {
        // Update agent node circuit state immediately
        const cbAgentId = agentId;
        const toState = payload.to as string | undefined;
        if (cbAgentId && toState) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === cbAgentId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: (toState === "open" ? "unhealthy" : toState === "half_open" ? "degraded" : "healthy") as NodeStatus,
                      metrics: { ...n.data.metrics, circuitState: toState },
                    },
                  }
                : n
            )
          );
        }
        break;
      }
    }
  }, [lastEvent]);

  // Sync animation engine state → edges every 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      const activeEdges = engineRef.current.getActiveEdges();
      setEdges((eds) =>
        eds.map((edge) => {
          const active = activeEdges.get(edge.id);
          if (active) {
            return { ...edge, data: { ...edge.data, active: true, color: active.color } };
          }
          if (edge.data?.active) {
            return { ...edge, data: { ...edge.data, active: false } };
          }
          return edge;
        })
      );
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Connection indicator
  const connectionDot = useMemo(
    () => (
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: isConnected ? "#10b981" : "#ef4444" }}
        />
        <span className="text-[11px] font-mono text-muted-foreground">
          {isConnected ? "Live" : "Disconnected"}
        </span>
      </div>
    ),
    [isConnected]
  );

  return (
    <div className="relative h-[calc(100vh-var(--header-height))] w-full" style={{ backgroundColor: "var(--canvas-bg)" }}>
      {connectionDot}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--canvas-grid)" gap={20} size={1} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={() => "var(--surface-raised)"}
          maskColor="rgba(0, 0, 0, 0.7)"
          position="top-right"
          style={{ marginTop: 50 }}
        />
      </ReactFlow>

      <MetricsPanel status={status} latencyHistory={latencyHistory} />
      <EventTimeline events={events} />
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
