import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { PgConsumerRepository } from "./pg-consumer-repo.js";
import type { ConsumerId } from "../types/brand.js";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "WidgetCorp",
    description: "Widget manufacturing AI consumer",
    contactEmail: "ops@widgetcorp.io",
    apiKeyHash: "hash_widget_abc",
    metadata: { plan: "starter" },
    ...overrides,
  };
}

describe("PgConsumerRepository", () => {
  const pool = getTestPool();
  const repo = new PgConsumerRepository(pool);

  beforeEach(async () => {
    await truncateAll(pool);
  });

  // 1
  it("create returns consumer with UUID id", async () => {
    const consumer = await repo.create(makeInput());
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(consumer.id).toMatch(uuidRe);
  });

  // 2
  it("create defaults status to active", async () => {
    const consumer = await repo.create(makeInput());
    expect(consumer.status).toBe("active");
  });

  // 3
  it("create defaults rateLimitPerMinute to 60", async () => {
    const consumer = await repo.create(makeInput());
    expect(consumer.rateLimitPerMinute).toBe(60);
  });

  // 4
  it("findById returns the created consumer", async () => {
    const created = await repo.create(makeInput());
    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("WidgetCorp");
    expect(found!.contactEmail).toBe("ops@widgetcorp.io");
  });

  // 5
  it("findById returns null for non-existent id", async () => {
    const result = await repo.findById("00000000-0000-0000-0000-000000000000" as ConsumerId);
    expect(result).toBeNull();
  });

  // 6
  it("list returns consumers with pagination", async () => {
    await repo.create(makeInput({ name: "Consumer A" }));
    await repo.create(makeInput({ name: "Consumer B" }));
    await repo.create(makeInput({ name: "Consumer C" }));

    const page1 = await repo.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBeDefined();

    const page2 = await repo.list({ limit: 2, cursor: page1.pagination.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });

  // 7
  it("list filters by status", async () => {
    const c = await repo.create(makeInput({ name: "Active One" }));
    await repo.create(makeInput({ name: "Also Active" }));
    await repo.update(c.id, { status: "suspended" });

    const suspended = await repo.list({ limit: 10 }, "suspended");
    expect(suspended.items).toHaveLength(1);
    expect(suspended.items[0].name).toBe("Active One");

    const active = await repo.list({ limit: 10 }, "active");
    expect(active.items).toHaveLength(1);
    expect(active.items[0].name).toBe("Also Active");
  });

  // 8
  it("update partial fields", async () => {
    const created = await repo.create(makeInput());
    const updated = await repo.update(created.id, { name: "NewCorp", rateLimitPerMinute: 120 });

    expect(updated.name).toBe("NewCorp");
    expect(updated.rateLimitPerMinute).toBe(120);
    // other fields unchanged
    expect(updated.description).toBe(created.description);
    expect(updated.contactEmail).toBe(created.contactEmail);
    expect(updated.apiKeyHash).toBe(created.apiKeyHash);
  });

  // 9
  it("update throws for non-existent consumer", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000" as ConsumerId;
    await expect(repo.update(fakeId, { name: "Nope" })).rejects.toThrow(
      `Consumer ${fakeId} not found`
    );
  });

  // 10a
  it("delete removes a consumer", async () => {
    const created = await repo.create(makeInput());
    await repo.delete(created.id);

    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  // 10b
  it("delete is silent for non-existent id", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000" as ConsumerId;
    await expect(repo.delete(fakeId)).resolves.toBeUndefined();
  });
});
