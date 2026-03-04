import { describe, it, expect, afterEach } from "vitest";
import {
  buildCanonicalMessage,
  signRequest,
  verifySignature,
  NonceCache,
} from "./signing.js";
import { generateKeypair } from "./keys.js";

describe("buildCanonicalMessage", () => {
  it("builds correct format with body", () => {
    const msg = buildCanonicalMessage("POST", "/api/test", "2024-01-01T00:00:00Z", "abc123", '{"key":"val"}');
    const lines = msg.split("\n");
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/api/test");
    expect(lines[2]).toBe("2024-01-01T00:00:00Z");
    expect(lines[3]).toBe("abc123");
    expect(lines[4]).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("uses empty-body hash for GET requests", () => {
    const msgGet = buildCanonicalMessage("GET", "/api/test", "ts", "nonce");
    const msgGetExplicit = buildCanonicalMessage("GET", "/api/test", "ts", "nonce", "");
    expect(msgGet).toBe(msgGetExplicit);
  });

  it("uppercases method", () => {
    const msg = buildCanonicalMessage("get", "/api/test", "ts", "nonce");
    expect(msg.startsWith("GET\n")).toBe(true);
  });

  it("different bodies produce different hashes", () => {
    const msg1 = buildCanonicalMessage("POST", "/test", "ts", "n", '{"a":1}');
    const msg2 = buildCanonicalMessage("POST", "/test", "ts", "n", '{"a":2}');
    expect(msg1).not.toBe(msg2);
  });
});

describe("signRequest + verifySignature", () => {
  it("produces valid signature headers", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "POST", "/api/test", '{"data":true}');
    expect(headers.publicKey).toBe(kp.publicKey);
    expect(headers.signature).toMatch(/^[0-9a-f]+$/);
    expect(headers.timestamp).toBeTruthy();
    expect(headers.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("verifies a valid signature", () => {
    const kp = generateKeypair();
    const body = '{"hello":"world"}';
    const headers = signRequest(kp.privateKey, "POST", "/api/data", body);
    const canonical = buildCanonicalMessage("POST", "/api/data", headers.timestamp, headers.nonce, body);
    expect(verifySignature(headers.publicKey, headers.signature, canonical)).toBe(true);
  });

  it("rejects tampered body", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "POST", "/api/data", '{"original":true}');
    const canonical = buildCanonicalMessage("POST", "/api/data", headers.timestamp, headers.nonce, '{"tampered":true}');
    expect(verifySignature(headers.publicKey, headers.signature, canonical)).toBe(false);
  });

  it("rejects tampered path", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "GET", "/api/original");
    const canonical = buildCanonicalMessage("GET", "/api/tampered", headers.timestamp, headers.nonce);
    expect(verifySignature(headers.publicKey, headers.signature, canonical)).toBe(false);
  });

  it("rejects wrong public key", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    const headers = signRequest(kp1.privateKey, "GET", "/api/test");
    const canonical = buildCanonicalMessage("GET", "/api/test", headers.timestamp, headers.nonce);
    expect(verifySignature(kp2.publicKey, headers.signature, canonical)).toBe(false);
  });

  it("rejects malformed signature", () => {
    const kp = generateKeypair();
    const canonical = buildCanonicalMessage("GET", "/test", "ts", "nonce");
    expect(verifySignature(kp.publicKey, "deadbeef", canonical)).toBe(false);
  });

  it("works for GET with no body", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "GET", "/api/resource");
    const canonical = buildCanonicalMessage("GET", "/api/resource", headers.timestamp, headers.nonce);
    expect(verifySignature(headers.publicKey, headers.signature, canonical)).toBe(true);
  });

  it("works for DELETE with no body", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "DELETE", "/api/resource/123");
    const canonical = buildCanonicalMessage("DELETE", "/api/resource/123", headers.timestamp, headers.nonce);
    expect(verifySignature(headers.publicKey, headers.signature, canonical)).toBe(true);
  });
});

describe("NonceCache", () => {
  let cache: NonceCache;

  afterEach(() => {
    cache?.destroy();
  });

  it("accepts a new nonce", () => {
    cache = new NonceCache();
    expect(cache.check("nonce-1")).toBe(true);
  });

  it("rejects a repeated nonce", () => {
    cache = new NonceCache();
    cache.check("nonce-1");
    expect(cache.check("nonce-1")).toBe(false);
  });

  it("accepts different nonces", () => {
    cache = new NonceCache();
    expect(cache.check("a")).toBe(true);
    expect(cache.check("b")).toBe(true);
    expect(cache.check("c")).toBe(true);
  });

  it("tracks size", () => {
    cache = new NonceCache();
    cache.check("x");
    cache.check("y");
    expect(cache.size).toBe(2);
  });
});
