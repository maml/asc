import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer } from "../test/helpers.js";
import { PgCryptoKeyRepository } from "./repository.js";
import { generateKeypair } from "./keys.js";
import type { CryptoKeyId } from "../types/brand.js";
import type { PublicKeyHex } from "./types.js";

const pool = getTestPool();
const repo = new PgCryptoKeyRepository(pool);

beforeEach(async () => {
  await truncateAll(pool);
});

describe("PgCryptoKeyRepository", () => {
  it("creates and returns a key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();

    const key = await repo.create({
      entityType: "provider",
      entityId: provider.id,
      publicKey: kp.publicKey,
      label: "test-key",
    });

    expect(key.id).toBeTruthy();
    expect(key.entityType).toBe("provider");
    expect(key.entityId).toBe(provider.id);
    expect(key.publicKey).toBe(kp.publicKey);
    expect(key.status).toBe("active");
    expect(key.label).toBe("test-key");
    expect(key.revokedAt).toBeNull();
  });

  it("finds an active key by public key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    const found = await repo.findByPublicKey(kp.publicKey);
    expect(found).not.toBeNull();
    expect(found!.publicKey).toBe(kp.publicKey);
  });

  it("returns null for unknown public key", async () => {
    const found = await repo.findByPublicKey("02" + "a".repeat(64));
    expect(found).toBeNull();
  });

  it("does not find revoked keys by public key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    const key = await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });
    await repo.revoke(key.id);

    const found = await repo.findByPublicKey(kp.publicKey);
    expect(found).toBeNull();
  });

  it("lists keys by entity", async () => {
    const provider = await createTestProvider(pool);
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp1.publicKey, label: "key-1" });
    await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp2.publicKey, label: "key-2" });

    const keys = await repo.listByEntity("provider", provider.id);
    expect(keys.length).toBe(2);
  });

  it("revokes a key", async () => {
    const consumer = await createTestConsumer(pool);
    const kp = generateKeypair();
    const key = await repo.create({ entityType: "consumer", entityId: consumer.id, publicKey: kp.publicKey });

    const revoked = await repo.revoke(key.id);
    expect(revoked).not.toBeNull();
    expect(revoked!.status).toBe("revoked");
    expect(revoked!.revokedAt).not.toBeNull();
  });

  it("returns null when revoking non-existent key", async () => {
    const result = await repo.revoke("00000000-0000-0000-0000-000000000000" as CryptoKeyId);
    expect(result).toBeNull();
  });

  it("enforces unique active public key constraint", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    await expect(
      repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey })
    ).rejects.toThrow();
  });

  it("allows re-registering a revoked key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    const key = await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });
    await repo.revoke(key.id);

    // Should succeed — the unique index only covers active keys
    const newKey = await repo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });
    expect(newKey.status).toBe("active");
  });
});
