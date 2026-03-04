import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { SettlementRepository } from "./repository.js";
import { createFullEntityChain } from "../test/helpers.js";
import type { ProviderId } from "../types/brand.js";

const pool = getTestPool();
const repo = new SettlementRepository(pool);

beforeEach(async () => {
  await truncateAll(pool);
});

describe("SettlementRepository", () => {
  describe("provider config", () => {
    it("upserts and retrieves provider config", async () => {
      const { provider } = await createFullEntityChain(pool);

      const config = await repo.upsertProviderConfig({
        providerId: provider.id,
        network: "lightning",
        lightningAddress: "user@strike.me",
        enabled: true,
      });

      expect(config.providerId).toBe(provider.id);
      expect(config.network).toBe("lightning");
      expect(config.lightningAddress).toBe("user@strike.me");
      expect(config.enabled).toBe(true);

      const fetched = await repo.getProviderConfig(provider.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.network).toBe("lightning");
    });

    it("upsert updates existing config", async () => {
      const { provider } = await createFullEntityChain(pool);

      await repo.upsertProviderConfig({
        providerId: provider.id,
        network: "lightning",
        lightningAddress: "old@strike.me",
        enabled: false,
      });

      const updated = await repo.upsertProviderConfig({
        providerId: provider.id,
        network: "noop",
        enabled: true,
      });

      expect(updated.network).toBe("noop");
      expect(updated.enabled).toBe(true);
      expect(updated.lightningAddress).toBeNull();
    });

    it("deletes provider config", async () => {
      const { provider } = await createFullEntityChain(pool);

      await repo.upsertProviderConfig({
        providerId: provider.id,
        network: "noop",
        enabled: true,
      });

      await repo.deleteProviderConfig(provider.id);
      const config = await repo.getProviderConfig(provider.id);
      expect(config).toBeNull();
    });

    it("returns null for non-existent config", async () => {
      const config = await repo.getProviderConfig("prov_nonexistent" as ProviderId);
      expect(config).toBeNull();
    });
  });

  describe("settlements", () => {
    it("creates and retrieves settlement", async () => {
      const chain = await createFullEntityChain(pool);

      // Create billing event first
      const { rows } = await pool.query(
        `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
         VALUES ($1, $2, $3, $4, 'invocation', 1000, 'USD', $5, '{}')
         RETURNING id`,
        [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 1000, currency: "USD" } }, capturedAt: new Date().toISOString() })]
      );
      const billingEventId = (rows[0] as Record<string, unknown>)["id"] as string;

      const settlement = await repo.createSettlement({
        billingEventId,
        providerId: chain.provider.id,
        consumerId: chain.consumer.id,
        agentId: chain.agent.id,
        network: "noop",
        grossAmountCents: 1000,
        providerAmountCents: 950,
        platformFeeCents: 50,
      });

      expect(settlement.billingEventId).toBe(billingEventId);
      expect(settlement.grossAmountCents).toBe(1000);
      expect(settlement.providerAmountCents).toBe(950);
      expect(settlement.platformFeeCents).toBe(50);
      expect(settlement.status).toBe("pending");
      expect(settlement.network).toBe("noop");

      // Retrieve by billing event ID
      const fetched = await repo.getByBillingEventId(billingEventId);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(settlement.id);

      // Retrieve by ID
      const byId = await repo.getById(settlement.id);
      expect(byId).not.toBeNull();
      expect(byId!.billingEventId).toBe(billingEventId);
    });

    it("enforces unique billing_event_id (idempotency)", async () => {
      const chain = await createFullEntityChain(pool);
      const { rows } = await pool.query(
        `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
         VALUES ($1, $2, $3, $4, 'invocation', 500, 'USD', $5, '{}')
         RETURNING id`,
        [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 500, currency: "USD" } }, capturedAt: new Date().toISOString() })]
      );
      const billingEventId = (rows[0] as Record<string, unknown>)["id"] as string;

      await repo.createSettlement({
        billingEventId,
        providerId: chain.provider.id,
        consumerId: chain.consumer.id,
        agentId: chain.agent.id,
        network: "noop",
        grossAmountCents: 500,
        providerAmountCents: 475,
        platformFeeCents: 25,
      });

      await expect(
        repo.createSettlement({
          billingEventId,
          providerId: chain.provider.id,
          consumerId: chain.consumer.id,
          agentId: chain.agent.id,
          network: "noop",
          grossAmountCents: 500,
          providerAmountCents: 475,
          platformFeeCents: 25,
        })
      ).rejects.toThrow();
    });

    it("updates settlement fields", async () => {
      const chain = await createFullEntityChain(pool);
      const { rows } = await pool.query(
        `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
         VALUES ($1, $2, $3, $4, 'invocation', 200, 'USD', $5, '{}')
         RETURNING id`,
        [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 200, currency: "USD" } }, capturedAt: new Date().toISOString() })]
      );
      const billingEventId = (rows[0] as Record<string, unknown>)["id"] as string;

      const settlement = await repo.createSettlement({
        billingEventId,
        providerId: chain.provider.id,
        consumerId: chain.consumer.id,
        agentId: chain.agent.id,
        network: "noop",
        grossAmountCents: 200,
        providerAmountCents: 190,
        platformFeeCents: 10,
      });

      const updated = await repo.updateSettlement(settlement.id, {
        status: "settled",
        externalId: "noop_ext_1",
        settledAt: new Date().toISOString(),
        attemptCount: 1,
      });

      expect(updated.status).toBe("settled");
      expect(updated.externalId).toBe("noop_ext_1");
      expect(updated.attemptCount).toBe(1);
      expect(updated.settledAt).toBeDefined();
    });

    it("lists settlements with filters", async () => {
      const chain = await createFullEntityChain(pool);

      // Create 2 billing events + settlements
      for (let i = 0; i < 2; i++) {
        const { rows } = await pool.query(
          `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
           VALUES ($1, $2, $3, $4, 'invocation', ${100 * (i + 1)}, 'USD', $5, '{}')
           RETURNING id`,
          [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 100, currency: "USD" } }, capturedAt: new Date().toISOString() })]
        );
        const beId = (rows[0] as Record<string, unknown>)["id"] as string;
        await repo.createSettlement({
          billingEventId: beId,
          providerId: chain.provider.id,
          consumerId: chain.consumer.id,
          agentId: chain.agent.id,
          network: "noop",
          grossAmountCents: 100 * (i + 1),
          providerAmountCents: 95 * (i + 1),
          platformFeeCents: 5 * (i + 1),
        });
      }

      const all = await repo.listSettlements({});
      expect(all).toHaveLength(2);

      const byProvider = await repo.listSettlements({ providerId: chain.provider.id });
      expect(byProvider).toHaveLength(2);

      const byConsumer = await repo.listSettlements({ consumerId: chain.consumer.id });
      expect(byConsumer).toHaveLength(2);

      const byStatus = await repo.listSettlements({ status: "pending" });
      expect(byStatus).toHaveLength(2);

      const byNetwork = await repo.listSettlements({ network: "lightning" });
      expect(byNetwork).toHaveLength(0);

      const limited = await repo.listSettlements({ limit: 1 });
      expect(limited).toHaveLength(1);
    });

    it("gets settlement summary", async () => {
      const chain = await createFullEntityChain(pool);

      for (let i = 0; i < 2; i++) {
        const { rows } = await pool.query(
          `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
           VALUES ($1, $2, $3, $4, 'invocation', 1000, 'USD', $5, '{}')
           RETURNING id`,
          [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 1000, currency: "USD" } }, capturedAt: new Date().toISOString() })]
        );
        const beId = (rows[0] as Record<string, unknown>)["id"] as string;
        await repo.createSettlement({
          billingEventId: beId,
          providerId: chain.provider.id,
          consumerId: chain.consumer.id,
          agentId: chain.agent.id,
          network: "noop",
          grossAmountCents: 1000,
          providerAmountCents: 950,
          platformFeeCents: 50,
        });
      }

      const summary = await repo.getSettlementSummary({
        periodStart: new Date(Date.now() - 86400000).toISOString(),
        periodEnd: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(summary.settlementCount).toBe(2);
      expect(summary.totalGrossCents).toBe(2000);
      expect(summary.totalProviderCents).toBe(1900);
      expect(summary.totalPlatformFeeCents).toBe(100);
      expect(summary.byNetwork["noop"]).toBeDefined();
      expect(summary.byNetwork["noop"].count).toBe(2);
    });

    it("lists pending settlements for reconciliation", async () => {
      const chain = await createFullEntityChain(pool);

      const { rows } = await pool.query(
        `INSERT INTO billing_events (task_id, agent_id, provider_id, consumer_id, event_type, amount_cents, currency, pricing_snapshot, metadata)
         VALUES ($1, $2, $3, $4, 'invocation', 300, 'USD', $5, '{}')
         RETURNING id`,
        [chain.taskId, chain.agent.id, chain.provider.id, chain.consumer.id, JSON.stringify({ agentId: chain.agent.id, pricing: { type: "per_invocation", pricePerCall: { amountCents: 300, currency: "USD" } }, capturedAt: new Date().toISOString() })]
      );
      const beId = (rows[0] as Record<string, unknown>)["id"] as string;
      await repo.createSettlement({
        billingEventId: beId,
        providerId: chain.provider.id,
        consumerId: chain.consumer.id,
        agentId: chain.agent.id,
        network: "noop",
        grossAmountCents: 300,
        providerAmountCents: 285,
        platformFeeCents: 15,
      });

      const pending = await repo.listPendingSettlements();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe("pending");
    });
  });
});
