import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "./utils.js";

describe("generateApiKey", () => {
  it("generates key with asc_ prefix by default", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^asc_[a-f0-9]{64}$/);
  });

  it("generates key with asc_test_ prefix for sandbox", () => {
    const key = generateApiKey("sandbox");
    expect(key).toMatch(/^asc_test_[a-f0-9]{64}$/);
  });

  it("generates key with asc_live_ prefix for production", () => {
    const key = generateApiKey("production");
    expect(key).toMatch(/^asc_live_[a-f0-9]{64}$/);
  });

  it("generates unique keys each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe("hashApiKey", () => {
  it("produces consistent SHA-256 hash", () => {
    const key = "asc_test_abc123";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different keys", () => {
    const hash1 = hashApiKey("asc_test_key1");
    const hash2 = hashApiKey("asc_test_key2");
    expect(hash1).not.toBe(hash2);
  });

  it("hashes keys with all prefix variants correctly", () => {
    // All prefixed keys should produce valid hashes and pass auth
    for (const prefix of ["asc_", "asc_test_", "asc_live_"]) {
      const key = `${prefix}deadbeef`;
      const hash = hashApiKey(key);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
