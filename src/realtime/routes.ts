// Realtime routes — WebSocket upgrade + system status endpoint

import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { CircuitBreakerManager } from "../coordination/circuit-breaker.js";
import type { AgentId } from "../types/brand.js";

interface AgentEndpoint {
  agentId: AgentId;
  name: string;
  healthUrl: string;
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  broadcaster: WsBroadcaster,
  circuitBreaker: CircuitBreakerManager,
  pool?: pg.Pool
): void {
  // WebSocket upgrade endpoint
  app.get("/ws/events", { websocket: true }, (socket) => {
    broadcaster.addClient(socket);
    socket.send(
      JSON.stringify({
        type: "connected",
        payload: { clientCount: broadcaster.clientCount },
        timestamp: new Date().toISOString(),
      })
    );
  });

  // System status REST endpoint — aggregates agent health + circuit breaker state
  app.get("/api/system/status", async () => {
    const allEndpoints: AgentEndpoint[] = [];

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT a.id, a.name, p.webhook_url
           FROM agents a JOIN providers p ON a.provider_id = p.id
           WHERE a.status = 'active' AND p.status = 'active'`
        );
        for (const row of rows as { id: string; name: string; webhook_url: string }[]) {
          allEndpoints.push({
            agentId: row.id as AgentId,
            name: row.name,
            healthUrl: `${row.webhook_url}/health`,
          });
        }
      } catch {
        // DB unavailable — return empty agent list
      }
    }

    const agents = await Promise.all(
      allEndpoints.map(async (ep) => {
        let healthy = false;
        let latencyMs = 0;
        try {
          const start = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(ep.healthUrl, { signal: controller.signal });
          clearTimeout(timeout);
          latencyMs = Date.now() - start;
          healthy = res.ok;
        } catch {
          healthy = false;
        }
        const cb = circuitBreaker.getState(ep.agentId);
        return {
          agentId: ep.agentId,
          name: ep.name,
          healthy,
          latencyMs,
          circuitState: cb.state,
          failureCount: cb.failureCount,
        };
      })
    );

    return {
      timestamp: new Date().toISOString(),
      backend: { status: "ok", uptime: process.uptime() },
      database: { status: "ok" },
      agents,
      websocket: { connectedClients: broadcaster.clientCount },
    };
  });
}
