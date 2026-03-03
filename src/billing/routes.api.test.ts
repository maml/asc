import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain, authHeader, createTestConsumer } from "../test/helpers.js";
import { clearAuthCache } from "../auth/hook.js";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { BillingRepository } from "./repo.js";
import type { AgentId } from "../types/brand.js";
import type { PricingSnapshot } from "../types/billing.js";

function makeSnapshot(agentId: string): PricingSnapshot {
  return {
    agentId: agentId as AgentId,
    pricing: {
      type: "per_invocation",
      pricePerCall: { amountCents: 50, currency: "USD" },
    },
    capturedAt: new Date().toISOString(),
  };
}

describe("Billing API routes", () => {
  const pool = getTestPool();
  const billingRepo = new BillingRepository(pool);
  let app: FastifyInstance;

  beforeAll(async () => {
    const ctx = await buildApp(pool);
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  // 1
  it("GET /api/billing-events returns events", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    await billingRepo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 100,
      pricingSnapshot: snapshot,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/billing-events?consumerId=${chain.consumer.id}`,
      headers: authHeader(chain.consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].consumerId).toBe(chain.consumer.id);
    expect(body.data.events[0].amount.amountCents).toBe(100);
  });

  // 2
  it("GET /api/billing/usage returns 400 when periodStart/periodEnd missing", async () => {
    const consumer = await createTestConsumer(pool);

    const res = await app.inject({
      method: "GET",
      url: "/api/billing/usage?consumerId=doesnt-matter",
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("periodStart");
  });

  // 3
  it("GET /api/billing/usage returns summary for period", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    await billingRepo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 75,
      pricingSnapshot: snapshot,
    });
    await billingRepo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 125,
      pricingSnapshot: snapshot,
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const oneHourLater = new Date(now.getTime() + 3600_000).toISOString();

    const res = await app.inject({
      method: "GET",
      url: `/api/billing/usage?consumerId=${chain.consumer.id}&periodStart=${encodeURIComponent(oneHourAgo)}&periodEnd=${encodeURIComponent(oneHourLater)}`,
      headers: authHeader(chain.consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.summary.totalCents).toBe(200);
    expect(body.data.summary.eventCount).toBe(2);
    expect(body.data.summary.byAgent).toHaveLength(1);
    expect(body.data.summary.byAgent[0].agentId).toBe(chain.agent.id);
  });

  // 4
  it("GET /api/billing/mtd returns month-to-date spend", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    await billingRepo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 300,
      pricingSnapshot: snapshot,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/billing/mtd",
      headers: authHeader(chain.consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalCents).toBe(300);
    expect(body.data.currency).toBe("USD");
  });

  // 5
  it("POST /api/invoices creates invoice (201)", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    // Seed a billing event so the invoice has a nonzero total
    await billingRepo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 250,
      pricingSnapshot: snapshot,
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - 3600_000).toISOString();
    const periodEnd = new Date(now.getTime() + 3600_000).toISOString();

    const res = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: authHeader(chain.consumer.apiKey),
      payload: {
        consumerId: chain.consumer.id,
        periodStart,
        periodEnd,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.invoice.id).toBeDefined();
    expect(body.data.invoice.consumerId).toBe(chain.consumer.id);
    expect(body.data.invoice.totalAmount.amountCents).toBe(250);
    expect(body.data.invoice.lineItemCount).toBe(1);
    expect(body.data.invoice.status).toBe("draft");
  });

  // 6
  it("GET /api/invoices returns invoices", async () => {
    const chain = await createFullEntityChain(pool);
    const now = new Date();
    const periodStart = new Date(now.getTime() - 3600_000).toISOString();
    const periodEnd = new Date(now.getTime() + 3600_000).toISOString();

    // Create two invoices via the API
    await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: authHeader(chain.consumer.apiKey),
      payload: { consumerId: chain.consumer.id, periodStart, periodEnd },
    });
    await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: authHeader(chain.consumer.apiKey),
      payload: { consumerId: chain.consumer.id, periodStart, periodEnd },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/invoices?consumerId=${chain.consumer.id}`,
      headers: authHeader(chain.consumer.apiKey),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.invoices).toHaveLength(2);
    expect(body.data.invoices[0].consumerId).toBe(chain.consumer.id);
  });

  // 7
  it("PATCH /api/invoices/:id updates status", async () => {
    const chain = await createFullEntityChain(pool);
    const now = new Date();
    const periodStart = new Date(now.getTime() - 3600_000).toISOString();
    const periodEnd = new Date(now.getTime() + 3600_000).toISOString();

    // Create an invoice
    const createRes = await app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: authHeader(chain.consumer.apiKey),
      payload: { consumerId: chain.consumer.id, periodStart, periodEnd },
    });
    const invoiceId = createRes.json().data.invoice.id;

    // Patch it to "issued"
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/invoices/${invoiceId}`,
      headers: authHeader(chain.consumer.apiKey),
      payload: { status: "issued" },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.success).toBe(true);

    // Verify via GET
    const listRes = await app.inject({
      method: "GET",
      url: `/api/invoices?consumerId=${chain.consumer.id}&status=issued`,
      headers: authHeader(chain.consumer.apiKey),
    });

    const invoices = listRes.json().data.invoices;
    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe(invoiceId);
    expect(invoices[0].status).toBe("issued");
  });
});
