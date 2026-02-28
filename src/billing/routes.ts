// REST routes for billing and invoicing

import type { FastifyInstance } from "fastify";
import type { BillingService } from "./service.js";

export function registerBillingRoutes(
  app: FastifyInstance,
  billingService: BillingService
): void {
  // List billing events
  app.get("/api/billing-events", async (req) => {
    const query = req.query as {
      consumerId?: string;
      agentId?: string;
      limit?: string;
    };
    const events = await billingService.listEvents({
      consumerId: query.consumerId,
      agentId: query.agentId,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { events } };
  });

  // Usage summary for a period
  app.get("/api/billing/usage", async (req, reply) => {
    const query = req.query as {
      consumerId?: string;
      agentId?: string;
      periodStart?: string;
      periodEnd?: string;
    };

    if (!query.periodStart || !query.periodEnd) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "periodStart and periodEnd are required", retryable: false },
      });
    }

    const summary = await billingService.getUsageSummary({
      consumerId: query.consumerId,
      agentId: query.agentId,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
    });
    return { data: { summary } };
  });

  // Month-to-date spend
  app.get("/api/billing/mtd", async () => {
    const result = await billingService.getMonthToDateSpend();
    return { data: { totalCents: result.totalCents, currency: result.currency } };
  });

  // Create an invoice
  app.post("/api/invoices", async (req, reply) => {
    const body = req.body as {
      consumerId: string;
      periodStart: string;
      periodEnd: string;
    };
    const invoice = await billingService.createInvoice(body);
    return reply.status(201).send({ data: { invoice } });
  });

  // List invoices
  app.get("/api/invoices", async (req) => {
    const query = req.query as {
      consumerId?: string;
      status?: string;
      limit?: string;
    };
    const invoices = await billingService.listInvoices({
      consumerId: query.consumerId,
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { invoices } };
  });

  // Update invoice status
  app.patch("/api/invoices/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    await billingService.updateInvoiceStatus(id, status);
    return { data: { success: true } };
  });
}
