// Billing service — calculates charges and delegates to the billing repository

import type { AgentId } from "../types/brand.js";
import type { BillingEvent, InvoiceSummary, PricingSnapshot } from "../types/billing.js";
import type { BillingRepository } from "./repo.js";
import type { AgentRepository } from "../registry/repository.js";

export class BillingService {
  constructor(
    private billingRepo: BillingRepository,
    private agentRepo: AgentRepository
  ) {}

  /** Record a billable invocation — looks up agent pricing and calculates the charge */
  async recordInvocation(
    task: { id: string; agentId: string; consumerId: string; traceId: string },
    durationMs: number
  ): Promise<BillingEvent> {
    const agent = await this.agentRepo.findById(task.agentId as AgentId);
    if (!agent) {
      throw new Error(`Agent ${task.agentId} not found`);
    }

    const pricing = agent.pricing;
    let amountCents: number;

    switch (pricing.type) {
      case "per_invocation":
        amountCents = pricing.pricePerCall.amountCents;
        break;
      case "per_second":
        amountCents = Math.ceil(durationMs / 1000) * pricing.pricePerSecond.amountCents;
        break;
      case "per_token":
        // V1: token counting not implemented yet, default to 100 cents
        amountCents = 100;
        break;
      case "flat_monthly":
        // Covered by subscription — no per-invocation charge
        amountCents = 0;
        break;
    }

    const pricingSnapshot: PricingSnapshot = {
      agentId: agent.id,
      pricing: agent.pricing,
      capturedAt: new Date().toISOString(),
    };

    return this.billingRepo.recordEvent({
      taskId: task.id,
      agentId: task.agentId,
      providerId: agent.providerId,
      consumerId: task.consumerId,
      eventType: "invocation",
      amountCents,
      pricingSnapshot,
      metadata: { traceId: task.traceId },
    });
  }

  async listEvents(opts: {
    consumerId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<BillingEvent[]> {
    return this.billingRepo.listEvents(opts);
  }

  async getUsageSummary(opts: {
    consumerId?: string;
    agentId?: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<{
    totalCents: number;
    eventCount: number;
    byAgent: { agentId: string; totalCents: number; eventCount: number }[];
  }> {
    return this.billingRepo.getUsageSummary(opts);
  }

  async createInvoice(data: {
    consumerId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<InvoiceSummary> {
    return this.billingRepo.createInvoice(data);
  }

  async listInvoices(opts: {
    consumerId?: string;
    status?: string;
    limit?: number;
  }): Promise<InvoiceSummary[]> {
    return this.billingRepo.listInvoices(opts);
  }

  async updateInvoiceStatus(id: string, status: string): Promise<void> {
    return this.billingRepo.updateInvoiceStatus(id, status);
  }

  async getMonthToDateSpend(): Promise<{ totalCents: number; currency: string }> {
    return this.billingRepo.getMonthToDateSpend();
  }
}
