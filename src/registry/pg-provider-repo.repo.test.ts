import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { PgProviderRepository } from "./pg-provider-repo.js";
import type { ProviderId } from "../types/brand.js";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme AI",
    description: "NLP provider",
    contactEmail: "ops@acme.dev",
    webhookUrl: "https://acme.dev/webhook",
    apiKeyHash: "hash_abc123",
    metadata: { tier: "free" },
    ...overrides,
  };
}

describe("PgProviderRepository", () => {
  const pool = getTestPool();
  const repo = new PgProviderRepository(pool);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  // 1
  it("create returns provider with UUID id", async () => {
    const provider = await repo.create(makeInput());
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(provider.id).toMatch(uuidRe);
  });

  // 2
  it("create defaults status to pending_review", async () => {
    const provider = await repo.create(makeInput());
    expect(provider.status).toBe("pending_review");
  });

  // 3
  it("create stores JSONB metadata and round-trips it", async () => {
    const meta = { tier: "enterprise", region: "us-east-1" };
    const provider = await repo.create(makeInput({ metadata: meta }));
    expect(provider.metadata).toEqual(meta);

    const fetched = await repo.findById(provider.id);
    expect(fetched!.metadata).toEqual(meta);
  });

  // 4
  it("findById returns the created provider", async () => {
    const created = await repo.create(makeInput());
    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("Acme AI");
    expect(found!.contactEmail).toBe("ops@acme.dev");
  });

  // 5
  it("findById returns null for non-existent id", async () => {
    const result = await repo.findById("00000000-0000-0000-0000-000000000000" as ProviderId);
    expect(result).toBeNull();
  });

  // 6
  it("list returns all providers", async () => {
    await repo.create(makeInput({ name: "Provider A" }));
    await repo.create(makeInput({ name: "Provider B" }));
    await repo.create(makeInput({ name: "Provider C" }));

    const result = await repo.list({ limit: 10 });
    expect(result.items).toHaveLength(3);
  });

  // 7
  it("list respects pagination limit", async () => {
    await repo.create(makeInput({ name: "P1" }));
    await repo.create(makeInput({ name: "P2" }));
    await repo.create(makeInput({ name: "P3" }));

    const result = await repo.list({ limit: 2 });
    expect(result.items).toHaveLength(2);
  });

  // 8
  it("list returns hasMore=true when more items exist", async () => {
    await repo.create(makeInput({ name: "P1" }));
    await repo.create(makeInput({ name: "P2" }));
    await repo.create(makeInput({ name: "P3" }));

    const result = await repo.list({ limit: 2 });
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBeDefined();
  });

  // 9
  it("list returns hasMore=false when no more items", async () => {
    await repo.create(makeInput({ name: "P1" }));
    await repo.create(makeInput({ name: "P2" }));

    const result = await repo.list({ limit: 10 });
    expect(result.pagination.hasMore).toBe(false);
  });

  // 10
  it("list filters by status", async () => {
    const p = await repo.create(makeInput({ name: "Active One" }));
    await repo.create(makeInput({ name: "Still Pending" }));
    await repo.update(p.id, { status: "active" });

    const active = await repo.list({ limit: 10 }, "active");
    expect(active.items).toHaveLength(1);
    expect(active.items[0].name).toBe("Active One");

    const pending = await repo.list({ limit: 10 }, "pending_review");
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0].name).toBe("Still Pending");
  });

  // 11
  it("update partial fields (e.g. just name)", async () => {
    const created = await repo.create(makeInput());
    const updated = await repo.update(created.id, { name: "New Name" });

    expect(updated.name).toBe("New Name");
    // other fields unchanged
    expect(updated.description).toBe(created.description);
    expect(updated.contactEmail).toBe(created.contactEmail);
    expect(updated.webhookUrl).toBe(created.webhookUrl);
  });

  // 12
  it("update throws for non-existent provider", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000" as ProviderId;
    await expect(repo.update(fakeId, { name: "Nope" })).rejects.toThrow(
      `Provider ${fakeId} not found`
    );
  });

  // 13
  it("delete removes a provider", async () => {
    const created = await repo.create(makeInput());
    await repo.delete(created.id);

    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  // 14
  it("delete is silent for non-existent id", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000" as ProviderId;
    await expect(repo.delete(fakeId)).resolves.toBeUndefined();
  });
});
