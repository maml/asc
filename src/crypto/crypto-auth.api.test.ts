// API tests for signature-based authentication flow.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, authHeader } from "../test/helpers.js";
import { buildApp } from "../app.js";
import { generateKeypair } from "./keys.js";
import { signRequest, buildCanonicalMessage } from "./signing.js";
import { PgCryptoKeyRepository } from "./repository.js";
import { clearAuthCache } from "../auth/hook.js";

let pool: pg.Pool;
let app: FastifyInstance;
let cryptoKeyRepo: PgCryptoKeyRepository;

beforeAll(async () => {
  pool = getTestPool();
  const ctx = await buildApp(pool);
  app = ctx.app;
  cryptoKeyRepo = new PgCryptoKeyRepository(pool);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(pool);
  clearAuthCache();
});

describe("signature auth flow", () => {
  it("authenticates with valid signature", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    const path = `/api/providers/${provider.id}`;
    const headers = signRequest(kp.privateKey, "GET", path);

    const res = await app.inject({
      method: "GET",
      url: path,
      headers: {
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": headers.signature,
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects request with expired timestamp", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    const path = `/api/providers/${provider.id}`;
    // Use a timestamp 10 minutes ago
    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nonce = "test-nonce-expired";
    const canonical = buildCanonicalMessage("GET", path, oldTimestamp, nonce);

    // Manually sign with the old timestamp
    const { secp256k1 } = await import("@noble/curves/secp256k1.js");
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const { bytesToHex } = await import("@noble/hashes/utils.js");
    const enc = new TextEncoder();
    const messageHash = sha256(enc.encode(canonical));
    const sig = secp256k1.sign(messageHash, kp.privateKey);
    const sigHex = bytesToHex(sig);

    const res = await app.inject({
      method: "GET",
      url: path,
      headers: {
        "x-asc-publickey": kp.publicKey,
        "x-asc-signature": sigHex,
        "x-asc-timestamp": oldTimestamp,
        "x-asc-nonce": nonce,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/timestamp/i);
  });

  it("rejects duplicate nonce (replay protection)", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    const path = `/api/providers/${provider.id}`;
    const headers = signRequest(kp.privateKey, "GET", path);
    const sigHeaders = {
      "x-asc-publickey": headers.publicKey,
      "x-asc-signature": headers.signature,
      "x-asc-timestamp": headers.timestamp,
      "x-asc-nonce": headers.nonce,
    };

    // First request succeeds
    const res1 = await app.inject({ method: "GET", url: path, headers: sigHeaders });
    expect(res1.statusCode).toBe(200);

    // Replay with same nonce fails
    const res2 = await app.inject({ method: "GET", url: path, headers: sigHeaders });
    expect(res2.statusCode).toBe(401);
    expect(res2.json().error.message).toMatch(/nonce/i);
  });

  it("rejects unregistered public key", async () => {
    const kp = generateKeypair();
    const path = "/api/providers";
    // A non-public route that requires auth
    const headers = signRequest(kp.privateKey, "GET", "/api/agents");

    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: {
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": headers.signature,
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/not registered/i);
  });

  it("rejects invalid signature", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "provider", entityId: provider.id, publicKey: kp.publicKey });

    const path = `/api/providers/${provider.id}`;
    const headers = signRequest(kp.privateKey, "GET", path);

    const res = await app.inject({
      method: "GET",
      url: path,
      headers: {
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": "deadbeef".repeat(8), // bad sig
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/invalid signature/i);
  });

  it("rejects ambiguous auth (both Bearer and signature headers)", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, "GET", `/api/providers/${provider.id}`);

    const res = await app.inject({
      method: "GET",
      url: `/api/providers/${provider.id}`,
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": headers.signature,
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/ambiguous/i);
  });

  it("rejects incomplete signature headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: {
        "x-asc-publickey": "02" + "a".repeat(64),
        // Missing signature, timestamp, nonce
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/incomplete/i);
  });

  it("existing API key auth still works", async () => {
    const provider = await createTestProvider(pool);

    const res = await app.inject({
      method: "GET",
      url: `/api/providers/${provider.id}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
  });

  it("consumer can authenticate with signature", async () => {
    const consumer = await createTestConsumer(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "consumer", entityId: consumer.id, publicKey: kp.publicKey });

    const path = `/api/consumers/${consumer.id}`;
    const headers = signRequest(kp.privateKey, "GET", path);

    const res = await app.inject({
      method: "GET",
      url: path,
      headers: {
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": headers.signature,
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("signature auth works for POST with body", async () => {
    const consumer = await createTestConsumer(pool);
    const kp = generateKeypair();
    await cryptoKeyRepo.create({ entityType: "consumer", entityId: consumer.id, publicKey: kp.publicKey });

    // Register a key via signature auth (POST with body)
    const body = JSON.stringify({ publicKey: generateKeypair().publicKey, label: "second-key" });
    const path = "/api/keys";
    const headers = signRequest(kp.privateKey, "POST", path, body);

    const res = await app.inject({
      method: "POST",
      url: path,
      headers: {
        "content-type": "application/json",
        "x-asc-publickey": headers.publicKey,
        "x-asc-signature": headers.signature,
        "x-asc-timestamp": headers.timestamp,
        "x-asc-nonce": headers.nonce,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
  });

  it("public routes remain accessible without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
