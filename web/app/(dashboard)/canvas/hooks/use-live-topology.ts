"use client";

import { useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { SystemNodeData, NodeStatus } from "../lib/canvas-config";

interface RegistryProvider {
  id: string;
  name: string;
  status?: string;
}

interface RegistryAgent {
  id: string;
  name: string;
  providerId: string;
  status?: string;
}

interface RegistryConsumer {
  id: string;
  name: string;
  status?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";
const POLL_INTERVAL = 10_000;

const BACKEND_DATA: SystemNodeData = { label: "ASC Engine", status: "healthy" as NodeStatus, metrics: { activeTasks: 0, eventsPerMin: 0, uptime: "0s" } };
const POSTGRES_DATA: SystemNodeData = { label: "PostgreSQL", status: "healthy" as NodeStatus, metrics: { connection: "connected" } };

const PG_EDGE: Edge = {
  id: "e-backend-pg",
  source: "backend",
  target: "postgres",
  type: "connection",
  label: "TCP",
};

// Spread nodes wide when empty so fitView zooms out, giving empty state room
function infraNodes(empty: boolean): Node<SystemNodeData>[] {
  return [
    {
      id: "backend",
      type: "backend",
      position: empty ? { x: 0, y: -80 } : { x: 350, y: 30 },
      data: BACKEND_DATA,
    },
    {
      id: "postgres",
      type: "postgres",
      position: empty ? { x: 900, y: -80 } : { x: 700, y: 30 },
      data: POSTGRES_DATA,
    },
  ];
}

// Layout constants
const CONSUMER_START_X = 0;
const CONSUMER_Y = 0;
const CONSUMER_SPACING = 190;
const CONSUMER_INNER_OFFSET = 30;
const PROVIDER_GROUP_Y = 250;
const PROVIDER_GROUP_START_X = 50;
const PROVIDER_GROUP_SPACING = 420;
const AGENT_SPACING = 170;
const AGENT_INNER_OFFSET = 20;

function buildTopology(
  providers: RegistryProvider[],
  consumers: RegistryConsumer[],
  agents: RegistryAgent[]
): { nodes: Node<SystemNodeData>[]; edges: Edge[] } {
  const nodes: Node<SystemNodeData>[] = [];
  const edges: Edge[] = [];

  // Consumer group
  if (consumers.length > 0) {
    const groupWidth = Math.max(220, consumers.length * CONSUMER_SPACING + 40);
    nodes.push({
      id: "group-consumers",
      type: "group",
      position: { x: CONSUMER_START_X, y: CONSUMER_Y },
      data: { label: "Consumers", status: "healthy" as NodeStatus, metrics: {} },
      style: { width: groupWidth, height: 140 },
    });

    consumers.forEach((c, i) => {
      nodes.push({
        id: c.id,
        type: "consumer",
        position: { x: CONSUMER_INNER_OFFSET + i * CONSUMER_SPACING, y: 40 },
        data: {
          label: c.name,
          status: "healthy" as NodeStatus,
          metrics: { requests: 0, lastRequest: "—" },
        },
        parentId: "group-consumers",
        extent: "parent" as const,
      });
      edges.push({
        id: `e-${c.id}-backend`,
        source: c.id,
        target: "backend",
        type: "dataFlow",
        label: "REST",
        animated: false,
      });
    });
  }

  // Infrastructure — spread wide when empty so fitView zooms out
  const hasEntities = consumers.length > 0 || agents.length > 0;
  nodes.push(...infraNodes(!hasEntities));
  edges.push(PG_EDGE);

  // Group agents by provider
  const providerMap = new Map<string, { provider: RegistryProvider; agents: RegistryAgent[] }>();
  for (const p of providers) {
    providerMap.set(p.id, { provider: p, agents: [] });
  }
  for (const a of agents) {
    const entry = providerMap.get(a.providerId);
    if (entry) {
      entry.agents.push(a);
    } else {
      // Agent references an unknown provider — create a fallback group
      providerMap.set(a.providerId, {
        provider: { id: a.providerId, name: `Provider ${a.providerId.slice(0, 8)}` },
        agents: [a],
      });
    }
  }

  // Render provider groups (only those with agents)
  let groupIndex = 0;
  for (const [providerId, { provider, agents: providerAgents }] of providerMap) {
    if (providerAgents.length === 0) continue;

    const groupId = `group-provider-${providerId}`;
    const groupWidth = Math.max(220, providerAgents.length * AGENT_SPACING + 40);
    const groupX = PROVIDER_GROUP_START_X + groupIndex * PROVIDER_GROUP_SPACING;

    nodes.push({
      id: groupId,
      type: "group",
      position: { x: groupX, y: PROVIDER_GROUP_Y },
      data: { label: provider.name, status: "healthy" as NodeStatus, metrics: {} },
      style: { width: groupWidth, height: 170 },
    });

    providerAgents.forEach((a, i) => {
      nodes.push({
        id: a.id,
        type: "agent",
        position: { x: AGENT_INNER_OFFSET + i * AGENT_SPACING, y: 40 },
        data: {
          label: a.name,
          status: "unknown" as NodeStatus,
          metrics: { circuitState: "closed", successRate: "—", avgLatency: "—" },
        },
        parentId: groupId,
        extent: "parent" as const,
      });
      // Backend → Agent edge (compatible with AnimationEngine pattern)
      edges.push({
        id: `e-backend-${a.id}`,
        source: "backend",
        target: a.id,
        type: "dataFlow",
        animated: false,
      });
    });

    groupIndex++;
  }

  return { nodes, edges };
}

async function fetchJson<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return [];
    const json = await res.json();
    // API returns { data: { providers/agents/consumers: [...], pagination } }
    const wrapper = json.data ?? json;
    return wrapper.providers ?? wrapper.agents ?? wrapper.consumers ?? [];
  } catch {
    return [];
  }
}

// Stable fingerprint of the topology structure (node/edge IDs).
// Only update React state when entities are added/removed — not on every poll.
function topoFingerprint(nodes: Node<SystemNodeData>[], edges: Edge[]): string {
  const nodeIds = nodes.map((n) => n.id).sort().join(",");
  const edgeIds = edges.map((e) => e.id).sort().join(",");
  return `${nodeIds}|${edgeIds}`;
}

export function useLiveTopology(enabled: boolean, registryVersion = 0) {
  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(infraNodes(true));
  const [edges, setEdges] = useState<Edge[]>([PG_EDGE]);
  const [isEmpty, setIsEmpty] = useState(true);
  const [loading, setLoading] = useState(false);
  const fingerprintRef = useRef("");

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      if (!enabled) return;
      setLoading(true);

      const [providers, consumers, agents] = await Promise.all([
        fetchJson<RegistryProvider>("/api/providers?limit=100"),
        fetchJson<RegistryConsumer>("/api/consumers?limit=100"),
        fetchJson<RegistryAgent>("/api/agents?limit=100"),
      ]);

      if (cancelled) return;

      const hasEntities = consumers.length > 0 || agents.length > 0;
      const topo = buildTopology(providers, consumers, agents);
      const fp = topoFingerprint(topo.nodes, topo.edges);

      // Only replace nodes/edges when the structure changes,
      // so dragged positions aren't overwritten by subsequent polls.
      if (fp !== fingerprintRef.current) {
        fingerprintRef.current = fp;
        setNodes(topo.nodes);
        setEdges(topo.edges);
      }

      setIsEmpty(!hasEntities);
      setLoading(false);
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, registryVersion]);

  return { nodes, edges, isEmpty, loading, fingerprint: fingerprintRef.current };
}
