import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { getPool, closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { PgProviderRepository } from "./registry/pg-provider-repo.js";
import { PgConsumerRepository } from "./registry/pg-consumer-repo.js";
import { PgAgentRepository } from "./registry/pg-agent-repo.js";
import { RegistryService } from "./registry/service.js";
import { registerRoutes } from "./registry/routes.js";
import { CoordinationRepository } from "./coordination/repository.js";
import { CoordinationService } from "./coordination/service.js";
import { CircuitBreakerManager } from "./coordination/circuit-breaker.js";
import { PgProviderLookup } from "./coordination/provider-lookup.js";
import { registerCoordinationRoutes } from "./coordination/routes.js";
import { TraceRepository } from "./observability/trace-repo.js";
import { TraceService } from "./observability/trace-service.js";
import { SlaRepository } from "./observability/sla-repo.js";
import { SlaService } from "./observability/sla-service.js";
import { QualityGateRepository } from "./observability/quality-repo.js";
import { QualityService } from "./observability/quality-service.js";
import { registerObservabilityRoutes } from "./observability/routes.js";
import { BillingRepository } from "./billing/repo.js";
import { BillingService } from "./billing/service.js";
import { registerBillingRoutes } from "./billing/routes.js";
import { WsBroadcaster } from "./realtime/ws-broadcaster.js";
import { registerRealtimeRoutes } from "./realtime/routes.js";


const PORT = parseInt(process.env["PORT"] ?? "3100", 10);

async function main(): Promise<void> {
  // Run migrations
  await runMigrations();

  const pool = getPool();

  // Wire up registry
  const providers = new PgProviderRepository(pool);
  const consumers = new PgConsumerRepository(pool);
  const agents = new PgAgentRepository(pool);
  // Wire up realtime broadcaster (before registry so it can emit events)
  const broadcaster = new WsBroadcaster();

  const registryService = new RegistryService(providers, consumers, agents, broadcaster);

  // Wire up coordination engine
  const coordRepo = new CoordinationRepository(pool, broadcaster);
  const providerLookup = new PgProviderLookup(pool);
  const circuitBreaker = new CircuitBreakerManager({
    onStateChange: (agentId, from, to) => {
      console.log(`Circuit breaker [${agentId}]: ${from} → ${to}`);
      broadcaster.broadcast({
        type: "circuit_state_change",
        payload: { agentId, from, to },
        timestamp: new Date().toISOString(),
      });
    },
  });

  // Wire up observability
  const traceRepo = new TraceRepository(pool);
  const traceService = new TraceService(traceRepo);
  const slaRepo = new SlaRepository(pool);
  const slaService = new SlaService(slaRepo);
  const qualityRepo = new QualityGateRepository(pool);
  const qualityService = new QualityService(qualityRepo);

  // Wire up billing
  const billingRepo = new BillingRepository(pool);
  const billingService = new BillingService(billingRepo, agents);

  const coordService = new CoordinationService(
    coordRepo, agents, providerLookup, circuitBreaker, traceService, qualityService, slaService, billingService
  );

  // Build server
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  await app.register(websocket);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Register routes
  registerRoutes(app, registryService);
  registerCoordinationRoutes(app, coordService);
  registerObservabilityRoutes(app, traceService, slaService, qualityService);
  registerBillingRoutes(app, billingService);

  // Register realtime routes (WebSocket + system status)
  registerRealtimeRoutes(app, broadcaster, circuitBreaker, pool);

  // Graceful shutdown
  const shutdown = async () => {
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`ASC server running on port ${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
