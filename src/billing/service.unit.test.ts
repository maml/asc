import { describe, it, expect, vi, beforeEach } from "vitest";
import { BillingService } from "./service.js";
import type { AgentId, ProviderId } from "../types/brand.js";
import type { Agent } from "../types/agent.js";
import type { BillingRepository } from "./repo.js";
import type { AgentRepository } from "../registry/repository.js";

// --- Helpers ---

function makeAgent(pricing: Agent["pricing"]): Agent {
  return {
    id: "agent-1" as AgentId,
    providerId: "provider-1" as ProviderId,
    name: "Test Agent",
    description: "A test agent",
    version: "1.0.0",
    status: "active",
    capabilities: [],
    pricing,
    sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
    supportsStreaming: false,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const task = {
  id: "task-1",
  agentId: "agent-1",
  consumerId: "consumer-1",
  traceId: "trace-1",
};

// --- Test suite ---

describe("BillingService.recordInvocation", () => {
  let billingRepo: { recordEvent: ReturnType<typeof vi.fn> };
  let agentRepo: { findById: ReturnType<typeof vi.fn> };
  let service: BillingService;

  beforeEach(() => {
    // Echo back the input as a BillingEvent-like object
    billingRepo = {
      recordEvent: vi.fn(async (data: Record<string, unknown>) => ({
        id: "evt-1",
        taskId: data.taskId,
        agentId: data.agentId,
        providerId: data.providerId,
        consumerId: data.consumerId,
        type: data.eventType,
        amount: { amountCents: data.amountCents, currency: "USD" },
        pricingSnapshot: data.pricingSnapshot,
        occurredAt: new Date().toISOString(),
        metadata: data.metadata ?? {},
      })),
    };
    agentRepo = { findById: vi.fn() };
    service = new BillingService(
      billingRepo as unknown as BillingRepository,
      agentRepo as unknown as AgentRepository,
    );
  });

  it("per_invocation: charges flat pricePerCall amount", async () => {
    const agent = makeAgent({
      type: "per_invocation",
      pricePerCall: { amountCents: 250, currency: "USD" },
    });
    agentRepo.findById.mockResolvedValue(agent);

    const result = await service.recordInvocation(task, 1200);

    expect(result.amount.amountCents).toBe(250);
    expect(billingRepo.recordEvent).toHaveBeenCalledOnce();
    expect(billingRepo.recordEvent.mock.calls[0][0]).toMatchObject({
      amountCents: 250,
      eventType: "invocation",
    });
  });

  it("per_second: ceil(durationMs / 1000) * pricePerSecond (500ms rounds up to 1s)", async () => {
    const agent = makeAgent({
      type: "per_second",
      pricePerSecond: { amountCents: 10, currency: "USD" },
    });
    agentRepo.findById.mockResolvedValue(agent);

    // 500ms → ceil(0.5) = 1 second → 1 * 10 = 10 cents
    const result = await service.recordInvocation(task, 500);

    expect(result.amount.amountCents).toBe(10);

    // Also verify a multi-second case: 2500ms → ceil(2.5) = 3 seconds → 30 cents
    const result2 = await service.recordInvocation(task, 2500);
    expect(result2.amount.amountCents).toBe(30);
  });

  it("per_token: hardcoded 100 cents (v1 placeholder)", async () => {
    const agent = makeAgent({
      type: "per_token",
      inputPricePerToken: { amountCents: 1, currency: "USD" },
      outputPricePerToken: { amountCents: 2, currency: "USD" },
    });
    agentRepo.findById.mockResolvedValue(agent);

    const result = await service.recordInvocation(task, 800);

    expect(result.amount.amountCents).toBe(100);
  });

  it("flat_monthly: charges 0 cents per invocation", async () => {
    const agent = makeAgent({
      type: "flat_monthly",
      monthlyPrice: { amountCents: 9900, currency: "USD" },
    });
    agentRepo.findById.mockResolvedValue(agent);

    const result = await service.recordInvocation(task, 3000);

    expect(result.amount.amountCents).toBe(0);
  });

  it("throws when agent not found", async () => {
    agentRepo.findById.mockResolvedValue(null);

    await expect(service.recordInvocation(task, 1000)).rejects.toThrow(
      "Agent agent-1 not found",
    );
    expect(billingRepo.recordEvent).not.toHaveBeenCalled();
  });

  it("pricingSnapshot contains capturedAt and matches agent pricing", async () => {
    const pricing = {
      type: "per_invocation" as const,
      pricePerCall: { amountCents: 50, currency: "USD" },
    };
    const agent = makeAgent(pricing);
    agentRepo.findById.mockResolvedValue(agent);

    const before = new Date().toISOString();
    await service.recordInvocation(task, 1000);
    const after = new Date().toISOString();

    const passedData = billingRepo.recordEvent.mock.calls[0][0];
    const snapshot = passedData.pricingSnapshot;

    expect(snapshot.agentId).toBe("agent-1");
    expect(snapshot.pricing).toEqual(pricing);
    expect(snapshot.capturedAt).toBeDefined();
    // capturedAt should be between before and after timestamps
    expect(snapshot.capturedAt >= before).toBe(true);
    expect(snapshot.capturedAt <= after).toBe(true);
  });
});
