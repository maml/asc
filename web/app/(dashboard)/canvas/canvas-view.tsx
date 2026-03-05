"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
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
import { TopologyToggle, type TopologyMode } from "./overlays/topology-toggle";
import { CanvasEmptyState } from "./overlays/canvas-empty-state";
import { useLiveTopology } from "./hooks/use-live-topology";

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

function getStoredMode(): TopologyMode {
  if (typeof window === "undefined") return "example";
  return (localStorage.getItem("asc-topology-mode") as TopologyMode) ?? "example";
}

// Re-fit the viewport when the live topology structure changes
function FitViewOnChange({ fingerprint }: { fingerprint: string }) {
  const { fitView } = useReactFlow();
  const prevRef = useRef("");

  useEffect(() => {
    if (!fingerprint || fingerprint === prevRef.current) return;
    prevRef.current = fingerprint;
    // Small delay so ReactFlow has processed the new nodes before fitting
    const timer = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
    return () => clearTimeout(timer);
  }, [fingerprint, fitView]);

  return null;
}

export function CanvasView() {
  return (
    <ReactFlowProvider>
      <CanvasViewInner />
    </ReactFlowProvider>
  );
}

function CanvasViewInner() {
  const [topologyMode, setTopologyMode] = useState<TopologyMode>(getStoredMode);
  const isLive = topologyMode === "live";

  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const [registryVersion, setRegistryVersion] = useState(0);
  const live = useLiveTopology(isLive, registryVersion);

  const engineRef = useRef(new AnimationEngine());
  const taskAgentMap = useRef<Map<string, string>>(new Map());
  const { savePositions } = useCanvasLayout();
  const { lastEvent, isConnected, events } = useWebSocket();
  const { status } = useSystemStatus(5000, registryVersion);
  const [latencyHistory, setLatencyHistory] = useState<Record<string, number[]>>({});

  // Swap topology data source when mode changes
  useEffect(() => {
    if (isLive) {
      setNodes(live.nodes);
      setEdges(live.edges);
    } else {
      setNodes(applyStoredPositions(initialNodes));
      setEdges(initialEdges);
    }
    engineRef.current.clear();
  }, [topologyMode, live.nodes, live.edges, isLive]);

  const handleModeChange = useCallback((mode: TopologyMode) => {
    localStorage.setItem("asc-topology-mode", mode);
    setTopologyMode(mode);
  }, []);

  // Restore saved positions after mount (avoids hydration mismatch)
  useEffect(() => {
    setNodes((nds) => applyStoredPositions(nds));
  }, []);

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
                : "unhealthy";

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
      case "task_created": {
        // Track which agent this task is for
        if (taskId && agentId) {
          taskAgentMap.current.set(taskId, agentId);
        }
        break;
      }
      case "task_started": {
        const resolvedAgentId = agentId ?? taskAgentMap.current.get(taskId ?? "");
        if (taskId && resolvedAgentId) {
          // In live mode, consumer edges use e-{consumerId}-backend pattern
          const consumerId = payload.consumerId as string | undefined;
          const consumerEdge = consumerId ? `e-${consumerId}-backend` : undefined;
          engineRef.current.startFlow(taskId, resolvedAgentId, consumerEdge);
        }
        // Update node metrics
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === "backend") {
              const current = Number(n.data.metrics.activeTasks ?? 0);
              return { ...n, data: { ...n.data, metrics: { ...n.data.metrics, activeTasks: current + 1 } } };
            }
            if (n.type === "consumer") {
              const current = Number(n.data.metrics.requests ?? 0);
              return { ...n, data: { ...n.data, metrics: { ...n.data.metrics, requests: current + 1, lastRequest: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) } } };
            }
            return n;
          })
        );
        break;
      }
      case "task_completed": {
        if (taskId) {
          engineRef.current.completeFlow(taskId);
          taskAgentMap.current.delete(taskId);
        }
        // Decrement active tasks
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === "backend") {
              const current = Math.max(0, Number(n.data.metrics.activeTasks ?? 0) - 1);
              return { ...n, data: { ...n.data, metrics: { ...n.data.metrics, activeTasks: current } } };
            }
            return n;
          })
        );
        break;
      }
      case "task_failed":
      case "task_timeout": {
        if (taskId) {
          engineRef.current.failFlow(taskId);
          taskAgentMap.current.delete(taskId);
        }
        // Decrement active tasks
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === "backend") {
              const current = Math.max(0, Number(n.data.metrics.activeTasks ?? 0) - 1);
              return { ...n, data: { ...n.data, metrics: { ...n.data.metrics, activeTasks: current } } };
            }
            return n;
          })
        );
        break;
      }
      case "registry_changed": {
        // Bump version to trigger immediate re-fetch in useLiveTopology
        setRegistryVersion((v) => v + 1);
        break;
      }
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

  // Connection indicator + topology toggle
  const topBar = useMemo(
    () => (
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: isConnected ? "#10b981" : "#ef4444" }}
          />
          <span className="text-[11px] font-mono text-muted-foreground">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <TopologyToggle mode={topologyMode} onChange={handleModeChange} />
      </div>
    ),
    [isConnected, topologyMode, handleModeChange]
  );

  return (
    <div className="relative h-[calc(100vh-var(--header-height))] w-full" style={{ backgroundColor: "var(--canvas-bg)" }}>
      {topBar}

      {isLive && live.isEmpty && !live.loading && <CanvasEmptyState />}

      <ReactFlow
        key={topologyMode}
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
        {isLive && <FitViewOnChange fingerprint={live.fingerprint} />}
        <Background color="var(--canvas-grid)" gap={20} size={1} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={() => "var(--surface-raised)"}
          maskColor="rgba(0, 0, 0, 0.7)"
          position="top-right"
          style={{ marginTop: 50 }}
        />
      </ReactFlow>

      <MetricsPanel
        status={status}
        latencyHistory={latencyHistory}
        visibleAgentIds={isLive ? new Set(nodes.filter((n) => n.type === "agent").map((n) => n.id)) : undefined}
      />
      <EventTimeline events={events} />
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
