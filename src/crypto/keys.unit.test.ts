import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  deriveMasterKey,
  deriveChildKey,
  deriveKeyPath,
  isValidPublicKey,
} from "./keys.js";

describe("generateKeypair", () => {
  it("generates a valid keypair", () => {
    const kp = generateKeypair();
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey).toMatch(/^(02|03)[0-9a-f]{64}$/);
  });

  it("generates unique keypairs", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});

describe("isValidPublicKey", () => {
  it("accepts a valid compressed public key", () => {
    const kp = generateKeypair();
    expect(isValidPublicKey(kp.publicKey)).toBe(true);
  });

  it("rejects an uncompressed key prefix", () => {
    expect(isValidPublicKey("04" + "a".repeat(128))).toBe(false);
  });

  it("rejects a short hex string", () => {
    expect(isValidPublicKey("02" + "ab".repeat(16))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPublicKey("")).toBe(false);
  });

  it("rejects non-hex chars", () => {
    expect(isValidPublicKey("02" + "gg".repeat(32))).toBe(false);
  });
});

describe("BIP-32 derivation", () => {
  const seed = new Uint8Array(32);
  seed.fill(42);

  it("derives a master key from seed", () => {
    const { key, chainCode } = deriveMasterKey(seed);
    expect(key.length).toBe(32);
    expect(chainCode.length).toBe(32);
  });

  it("derives deterministic master keys", () => {
    const a = deriveMasterKey(seed);
    const b = deriveMasterKey(seed);
    expect(Array.from(a.key)).toEqual(Array.from(b.key));
    expect(Array.from(a.chainCode)).toEqual(Array.from(b.chainCode));
  });

  it("derives different child keys for different indices", () => {
    const master = deriveMasterKey(seed);
    const child0 = deriveChildKey(master.key, master.chainCode, 0);
    const child1 = deriveChildKey(master.key, master.chainCode, 1);
    expect(Array.from(child0.key)).not.toEqual(Array.from(child1.key));
  });

  it("derives a full key path deterministically", () => {
    const path = { purpose: 44, orgIndex: 0, scope: "provider-auth" as const, childIndex: 0 };
    const kp1 = deriveKeyPath(seed, path);
    const kp2 = deriveKeyPath(seed, path);
    expect(kp1.publicKey).toBe(kp2.publicKey);
    expect(Array.from(kp1.privateKey)).toEqual(Array.from(kp2.privateKey));
  });

  it("different scopes produce different keys", () => {
    const providerKey = deriveKeyPath(seed, { purpose: 44, orgIndex: 0, scope: "provider-auth", childIndex: 0 });
    const consumerKey = deriveKeyPath(seed, { purpose: 44, orgIndex: 0, scope: "consumer-auth", childIndex: 0 });
    expect(providerKey.publicKey).not.toBe(consumerKey.publicKey);
  });

  it("derived keys are valid secp256k1 keys", () => {
    const kp = deriveKeyPath(seed, { purpose: 44, orgIndex: 1, scope: "delegation", childIndex: 3 });
    expect(isValidPublicKey(kp.publicKey)).toBe(true);
  });
});
