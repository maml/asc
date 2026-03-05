// Builds the fully-wired Fastify app. Extracted from server.ts so tests
// can create an app without starting an HTTP listener.

import type pg from "pg";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
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
import { PipelineRepository } from "./pipeline/repository.js";
import { PipelineService } from "./pipeline/service.js";
import { registerPipelineRoutes } from "./pipeline/routes.js";
import { buildAuthHook } from "./auth/hook.js";
import { PgCryptoKeyRepository } from "./crypto/repository.js";
import { buildSignatureAuthHook } from "./crypto/verify.js";
import { registerCryptoRoutes } from "./crypto/routes.js";
import { SettlementRepository } from "./settlement/repository.js";
import { SettlementService } from "./settlement/service.js";
import { registerSettlementRoutes } from "./settlement/routes.js";
import { NoopAdapter } from "./settlement/adapters/noop.js";
import { StrikeAdapter } from "./settlement/adapters/strike.js";
import type { SettlementNetwork, SettlementAdapter } from "./types/settlement.js";
import "./auth/types.js";
import "./crypto/types.js";

export interface AppContext {
  app: FastifyInstance;
  coordService: CoordinationService;
  pipelineService: PipelineService;
  circuitBreaker: CircuitBreakerManager;
  broadcaster: WsBroadcaster;
}

export async function buildApp(pool: pg.Pool): Promise<AppContext> {
  // Wire up registry
  const providers = new PgProviderRepository(pool);
  const consumers = new PgConsumerRepository(pool);
  const agents = new PgAgentRepository(pool);
  const broadcaster = new WsBroadcaster();
  const registryService = new RegistryService(providers, consumers, agents, broadcaster);

  // Wire up coordination engine
  const coordRepo = new CoordinationRepository(pool, broadcaster);
  const providerLookup = new PgProviderLookup(pool);
  const circuitBreaker = new CircuitBreakerManager({
    onStateChange: (agentId, from, to) => {
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

  // Wire up settlement
  const settlementRepo = new SettlementRepository(pool);
  const settlementAdapters = new Map<SettlementNetwork, SettlementAdapter>();
  settlementAdapters.set("noop", new NoopAdapter());
  if (process.env["STRIKE_API_KEY"]) {
    settlementAdapters.set("lightning", new StrikeAdapter({ apiKey: process.env["STRIKE_API_KEY"] }));
  }
  const settlementService = new SettlementService(settlementRepo, settlementAdapters, {
    defaultFeePercentage: 0.02,
    minimumFeeCents: 1,
  });

  // Wire up billing (with settlement)
  const billingRepo = new BillingRepository(pool);
  const billingService = new BillingService(billingRepo, agents, settlementService);

  const coordService = new CoordinationService(
    coordRepo, agents, providerLookup, circuitBreaker, traceService, qualityService, slaService, billingService
  );

  // Wire up pipeline engine
  const pipelineRepo = new PipelineRepository(pool, broadcaster);
  const pipelineService = new PipelineService(pipelineRepo, agents, coordService);

  // Wire up crypto identity
  const cryptoKeyRepo = new PgCryptoKeyRepository(pool);

  // Build Fastify app
  const isProd = process.env["NODE_ENV"] === "production";
  const app = Fastify({ logger: isProd ? { level: "info" } : false });

  // CORS: use CORS_ORIGIN env var in production (comma-separated), allow all in dev
  const corsOrigin = process.env["CORS_ORIGIN"];
  const origin = corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true;
  await app.register(cors, { origin, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });
  await app.register(websocket);

  // Capture raw body for signature verification (must be before JSON parser runs)
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      const json = body.length > 0 ? JSON.parse(body.toString()) : undefined;
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Auth middleware — validates API keys on all non-public routes
  app.addHook("onRequest", buildAuthHook(providers, consumers));

  // Signature auth — runs after API key hook, picks up requests with sig headers
  app.addHook("preHandler", buildSignatureAuthHook(cryptoKeyRepo, providers, consumers));

  // Register all routes
  registerRoutes(app, registryService, pool);
  registerCoordinationRoutes(app, coordService);
  registerObservabilityRoutes(app, traceService, slaService, qualityService);
  registerBillingRoutes(app, billingService);
  registerPipelineRoutes(app, pipelineService);
  registerCryptoRoutes(app, cryptoKeyRepo);
  registerSettlementRoutes(app, settlementService);
  registerRealtimeRoutes(app, broadcaster, circuitBreaker, pool);

  return { app, coordService, pipelineService, circuitBreaker, broadcaster };
}
