import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain } from "../test/helpers.js";
import { BillingRepository } from "./repo.js";
import type { PricingSnapshot } from "../types/billing.js";
import type { AgentId } from "../types/brand.js";

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

describe("BillingRepository", () => {
  const pool = getTestPool();
  const repo = new BillingRepository(pool);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  // 1
  it("recordEvent stores and returns BillingEvent with pricing snapshot JSONB", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    const event = await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 100,
      pricingSnapshot: snapshot,
    });

    expect(event.id).toBeDefined();
    expect(event.taskId).toBe(chain.taskId);
    expect(event.agentId).toBe(chain.agent.id);
    expect(event.consumerId).toBe(chain.consumer.id);
    expect(event.type).toBe("invocation");
    expect(event.amount).toEqual({ amountCents: 100, currency: "USD" });
    expect(event.pricingSnapshot).toEqual(snapshot);
    expect(event.occurredAt).toBeDefined();
  });

  // 2
  it("listEvents returns events in descending order", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    const e1 = await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 10,
      pricingSnapshot: snapshot,
    });

    const e2 = await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 20,
      pricingSnapshot: snapshot,
    });

    const events = await repo.listEvents({ limit: 10 });

    expect(events).toHaveLength(2);
    // Most recent first
    expect(events[0].id).toBe(e2.id);
    expect(events[1].id).toBe(e1.id);
  });

  // 3
  it("listEvents filters by consumerId", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);
    const snapshot1 = makeSnapshot(chain1.agent.id);
    const snapshot2 = makeSnapshot(chain2.agent.id);

    await repo.recordEvent({
      taskId: chain1.taskId,
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      consumerId: chain1.consumer.id,
      eventType: "invocation",
      amountCents: 10,
      pricingSnapshot: snapshot1,
    });

    await repo.recordEvent({
      taskId: chain2.taskId,
      agentId: chain2.agent.id,
      providerId: chain2.provider.id,
      consumerId: chain2.consumer.id,
      eventType: "invocation",
      amountCents: 20,
      pricingSnapshot: snapshot2,
    });

    const filtered = await repo.listEvents({ consumerId: chain1.consumer.id });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].consumerId).toBe(chain1.consumer.id);
  });

  // 4
  it("getUsageSummary returns correct totals and byAgent breakdown", async () => {
    const chain1 = await createFullEntityChain(pool);
    const chain2 = await createFullEntityChain(pool);
    const snapshot1 = makeSnapshot(chain1.agent.id);
    const snapshot2 = makeSnapshot(chain2.agent.id);

    // Two events for agent 1
    await repo.recordEvent({
      taskId: chain1.taskId,
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      consumerId: chain1.consumer.id,
      eventType: "invocation",
      amountCents: 100,
      pricingSnapshot: snapshot1,
    });
    await repo.recordEvent({
      taskId: chain1.taskId,
      agentId: chain1.agent.id,
      providerId: chain1.provider.id,
      consumerId: chain1.consumer.id,
      eventType: "invocation",
      amountCents: 50,
      pricingSnapshot: snapshot1,
    });

    // One event for agent 2
    await repo.recordEvent({
      taskId: chain2.taskId,
      agentId: chain2.agent.id,
      providerId: chain2.provider.id,
      consumerId: chain2.consumer.id,
      eventType: "invocation",
      amountCents: 200,
      pricingSnapshot: snapshot2,
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const oneHourLater = new Date(now.getTime() + 3600_000);

    const summary = await repo.getUsageSummary({
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });

    expect(summary.totalCents).toBe(350);
    expect(summary.eventCount).toBe(3);
    expect(summary.byAgent).toHaveLength(2);

    // Ordered by total_cents DESC
    const top = summary.byAgent[0];
    expect(top.agentId).toBe(chain2.agent.id);
    expect(top.totalCents).toBe(200);
    expect(top.eventCount).toBe(1);

    const second = summary.byAgent[1];
    expect(second.agentId).toBe(chain1.agent.id);
    expect(second.totalCents).toBe(150);
    expect(second.eventCount).toBe(2);
  });

  // 5
  it("createInvoice computes total from events for the period", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 75,
      pricingSnapshot: snapshot,
    });
    await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 125,
      pricingSnapshot: snapshot,
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const oneHourLater = new Date(now.getTime() + 3600_000);

    const invoice = await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });

    expect(invoice.id).toBeDefined();
    expect(invoice.consumerId).toBe(chain.consumer.id);
    expect(invoice.totalAmount).toEqual({ amountCents: 200, currency: "USD" });
    expect(invoice.lineItemCount).toBe(2);
    expect(invoice.status).toBe("draft");
    expect(invoice.periodStart).toBeDefined();
    expect(invoice.periodEnd).toBeDefined();
    expect(invoice.createdAt).toBeDefined();
  });

  // 6
  it("listInvoices returns invoices", async () => {
    const chain = await createFullEntityChain(pool);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const oneHourLater = new Date(now.getTime() + 3600_000);

    await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });
    await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });

    const invoices = await repo.listInvoices({ limit: 10 });

    expect(invoices).toHaveLength(2);
    expect(invoices[0].consumerId).toBe(chain.consumer.id);
  });

  // 7
  it("listInvoices filters by status", async () => {
    const chain = await createFullEntityChain(pool);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const oneHourLater = new Date(now.getTime() + 3600_000);

    const inv1 = await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });
    await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });

    // Move one to "issued"
    await repo.updateInvoiceStatus(inv1.id, "issued");

    const drafts = await repo.listInvoices({ status: "draft" });
    expect(drafts).toHaveLength(1);

    const issued = await repo.listInvoices({ status: "issued" });
    expect(issued).toHaveLength(1);
    expect(issued[0].id).toBe(inv1.id);
  });

  // 8
  it("updateInvoiceStatus changes status", async () => {
    const chain = await createFullEntityChain(pool);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);
    const oneHourLater = new Date(now.getTime() + 3600_000);

    const invoice = await repo.createInvoice({
      consumerId: chain.consumer.id,
      periodStart: oneHourAgo.toISOString(),
      periodEnd: oneHourLater.toISOString(),
    });

    expect(invoice.status).toBe("draft");

    await repo.updateInvoiceStatus(invoice.id, "issued");

    const invoices = await repo.listInvoices({ consumerId: chain.consumer.id });
    const updated = invoices.find((i) => i.id === invoice.id);
    expect(updated!.status).toBe("issued");

    await repo.updateInvoiceStatus(invoice.id, "paid");

    const invoices2 = await repo.listInvoices({ consumerId: chain.consumer.id });
    const paid = invoices2.find((i) => i.id === invoice.id);
    expect(paid!.status).toBe("paid");
  });

  // 9
  it("getMonthToDateSpend returns current month total", async () => {
    const chain = await createFullEntityChain(pool);
    const snapshot = makeSnapshot(chain.agent.id);

    await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 300,
      pricingSnapshot: snapshot,
    });
    await repo.recordEvent({
      taskId: chain.taskId,
      agentId: chain.agent.id,
      providerId: chain.provider.id,
      consumerId: chain.consumer.id,
      eventType: "invocation",
      amountCents: 150,
      pricingSnapshot: snapshot,
    });

    const spend = await repo.getMonthToDateSpend();

    expect(spend.totalCents).toBe(450);
    expect(spend.currency).toBe("USD");
  });
});
