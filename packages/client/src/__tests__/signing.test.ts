import { describe, it, expect } from "vitest";
import { generateKeypair, isValidPublicKey } from "../keys.js";
import { signRequest, buildCanonicalMessage } from "../signing.js";

describe("SDK key generation", () => {
  it("generates valid keypairs", () => {
    const kp = generateKeypair();
    expect(kp.privateKey.length).toBe(32);
    expect(isValidPublicKey(kp.publicKey)).toBe(true);
  });
});

describe("SDK signRequest", () => {
  it("produces all 4 required headers", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "POST", "/api/test", '{"data":1}');
    expect(headers["X-ASC-PublicKey"]).toBe(kp.publicKey);
    expect(headers["X-ASC-Signature"]).toMatch(/^[0-9a-f]+$/);
    expect(headers["X-ASC-Timestamp"]).toBeTruthy();
    expect(headers["X-ASC-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different nonces each call", () => {
    const kp = generateKeypair();
    const h1 = signRequest(kp.privateKey, "GET", "/test");
    const h2 = signRequest(kp.privateKey, "GET", "/test");
    expect(h1["X-ASC-Nonce"]).not.toBe(h2["X-ASC-Nonce"]);
  });

  it("works with no body", () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "DELETE", "/api/resource/123");
    expect(headers["X-ASC-Signature"]).toMatch(/^[0-9a-f]+$/);
  });
});

describe("SDK buildCanonicalMessage", () => {
  it("formats correctly", () => {
    const msg = buildCanonicalMessage("POST", "/api/x", "ts", "nonce", '{"a":1}');
    const lines = msg.split("\n");
    expect(lines.length).toBe(5);
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/api/x");
  });

  it("consistent empty body hash for GET", () => {
    const msg1 = buildCanonicalMessage("GET", "/a", "t", "n");
    const msg2 = buildCanonicalMessage("GET", "/a", "t", "n", "");
    expect(msg1).toBe(msg2);
  });
});
