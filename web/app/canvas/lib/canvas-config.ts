import type { Node, Edge } from "@xyflow/react";

export type NodeStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface SystemNodeData {
  label: string;
  status: NodeStatus;
  metrics: Record<string, string | number>;
  [key: string]: unknown;
}

// Fixed positions — spread out for comfortable default fitView
export const initialNodes: Node<SystemNodeData>[] = [
  // Consumer group — far left
  {
    id: "group-consumers",
    type: "group",
    position: { x: 0, y: 60 },
    data: { label: "Consumers", status: "healthy" as NodeStatus, metrics: {} },
    style: { width: 220, height: 140 },
  },
  {
    id: "consumer",
    type: "consumer",
    position: { x: 30, y: 40 },
    data: { label: "Consumer", status: "healthy" as NodeStatus, metrics: { requests: 0, lastRequest: "—" } },
    parentId: "group-consumers",
    extent: "parent" as const,
  },
  // ASC Backend — center
  {
    id: "backend",
    type: "backend",
    position: { x: 420, y: 60 },
    data: { label: "ASC Engine", status: "healthy" as NodeStatus, metrics: { activeTasks: 0, eventsPerMin: 0, uptime: "0s" } },
  },
  // Database — far right
  {
    id: "postgres",
    type: "postgres",
    position: { x: 820, y: 60 },
    data: { label: "PostgreSQL", status: "healthy" as NodeStatus, metrics: { connection: "connected" } },
  },
  // Agent group — centered below backend
  {
    id: "group-agents",
    type: "group",
    position: { x: 300, y: 320 },
    data: { label: "Agents", status: "healthy" as NodeStatus, metrics: {} },
    style: { width: 520, height: 170 },
  },
  {
    id: "echo-agent",
    type: "agent",
    position: { x: 20, y: 40 },
    data: { label: "Echo Agent", status: "healthy" as NodeStatus, metrics: { circuitState: "closed", successRate: "—", avgLatency: "—" } },
    parentId: "group-agents",
    extent: "parent" as const,
  },
  {
    id: "slow-agent",
    type: "agent",
    position: { x: 190, y: 40 },
    data: { label: "Slow Agent", status: "healthy" as NodeStatus, metrics: { circuitState: "closed", successRate: "—", avgLatency: "—" } },
    parentId: "group-agents",
    extent: "parent" as const,
  },
  {
    id: "flaky-agent",
    type: "agent",
    position: { x: 360, y: 40 },
    data: { label: "Flaky Agent", status: "healthy" as NodeStatus, metrics: { circuitState: "closed", successRate: "—", avgLatency: "—" } },
    parentId: "group-agents",
    extent: "parent" as const,
  },
];

export const initialEdges: Edge[] = [
  // Consumer → Backend
  { id: "e-consumer-backend", source: "consumer", target: "backend", type: "dataFlow", label: "REST", animated: false },
  // Backend → Postgres
  { id: "e-backend-pg", source: "backend", target: "postgres", type: "connection", label: "TCP" },
  // Backend → Agents
  { id: "e-backend-echo", source: "backend", target: "echo-agent", type: "dataFlow", animated: false },
  { id: "e-backend-slow", source: "backend", target: "slow-agent", type: "dataFlow", animated: false },
  { id: "e-backend-flaky", source: "backend", target: "flaky-agent", type: "dataFlow", animated: false },
];

export const statusColors: Record<NodeStatus, { border: string; glow: string; dot: string }> = {
  healthy: { border: "#10b981", glow: "rgba(16, 185, 129, 0.15)", dot: "#10b981" },
  degraded: { border: "#f59e0b", glow: "rgba(245, 158, 11, 0.15)", dot: "#f59e0b" },
  unhealthy: { border: "#ef4444", glow: "rgba(239, 68, 68, 0.15)", dot: "#ef4444" },
  unknown: { border: "#6b6b6b", glow: "rgba(107, 107, 107, 0.1)", dot: "#6b6b6b" },
};
