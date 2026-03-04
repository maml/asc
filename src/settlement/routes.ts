// REST routes for settlement

import type { FastifyInstance } from "fastify";
import type { SettlementService } from "./service.js";

export function registerSettlementRoutes(
  app: FastifyInstance,
  settlementService: SettlementService,
): void {
  // List settlements
  app.get("/api/settlements", async (req) => {
    const query = req.query as {
      providerId?: string;
      consumerId?: string;
      status?: string;
      network?: string;
      limit?: string;
    };
    const settlements = await settlementService.listSettlements({
      providerId: query.providerId,
      consumerId: query.consumerId,
      status: query.status,
      network: query.network,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { settlements } };
  });

  // Get single settlement
  app.get("/api/settlements/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const settlement = await settlementService.getSettlement(id);
    if (!settlement) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Settlement not found", retryable: false },
      });
    }
    return { data: { settlement } };
  });

  // Settlement summary
  app.get("/api/settlements/summary", async (req, reply) => {
    const query = req.query as {
      providerId?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    if (!query.periodStart || !query.periodEnd) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "periodStart and periodEnd are required", retryable: false },
      });
    }
    const summary = await settlementService.getSettlementSummary({
      providerId: query.providerId,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });
    return { data: { summary } };
  });

  // Get provider settlement config
  app.get("/api/providers/:id/settlement-config", async (req, reply) => {
    const { id } = req.params as { id: string };
    const config = await settlementService.getProviderConfig(id);
    if (!config) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Settlement config not found", retryable: false },
      });
    }
    return { data: { config } };
  });

  // Create/update provider settlement config
  app.put("/api/providers/:id/settlement-config", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      network: string;
      lightningAddress?: string;
      liquidAddress?: string;
      stripeConnectAccountId?: string;
      enabled?: boolean;
      metadata?: Record<string, unknown>;
    };
    const config = await settlementService.upsertProviderConfig({
      providerId: id,
      network: body.network as any,
      lightningAddress: body.lightningAddress,
      liquidAddress: body.liquidAddress,
      stripeConnectAccountId: body.stripeConnectAccountId,
      enabled: body.enabled,
      metadata: body.metadata,
    });
    return { data: { config } };
  });

  // Delete provider settlement config
  app.delete("/api/providers/:id/settlement-config", async (req) => {
    const { id } = req.params as { id: string };
    await settlementService.deleteProviderConfig(id);
    return { data: { success: true } };
  });

  // Trigger reconciliation
  app.post("/api/settlements/reconcile", async () => {
    const result = await settlementService.reconcilePending();
    return { data: { result } };
  });
}
