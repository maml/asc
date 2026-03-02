"use client";

import { useEffect, useState, useCallback } from "react";

interface AgentStatus {
  agentId: string;
  name: string;
  healthy: boolean;
  latencyMs: number;
  circuitState: "closed" | "half_open" | "open";
  failureCount: number;
}

export interface SystemStatus {
  timestamp: string;
  backend: { status: string; uptime: number };
  database: { status: string };
  agents: AgentStatus[];
  websocket: { connectedClients: number };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

export function useSystemStatus(intervalMs = 5000, registryVersion = 0): { status: SystemStatus | null; error: string | null } {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SystemStatus;
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(id);
  }, [fetchStatus, intervalMs, registryVersion]);

  return { status, error };
}
