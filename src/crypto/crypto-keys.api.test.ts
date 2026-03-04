// API tests for key management endpoints (POST/GET/DELETE /api/keys).

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createTestProvider, createTestConsumer, authHeader } from "../test/helpers.js";
import { buildApp } from "../app.js";
import { generateKeypair } from "./keys.js";
import { clearAuthCache } from "../auth/hook.js";

let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = getTestPool();
  const ctx = await buildApp(pool);
  app = ctx.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await truncateAll(pool);
  clearAuthCache();
});

describe("POST /api/keys", () => {
  it("registers a valid public key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();

    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp.publicKey, label: "my-key" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.publicKey).toBe(kp.publicKey);
    expect(body.data.label).toBe("my-key");
    expect(body.data.status).toBe("active");
  });

  it("rejects invalid public key", async () => {
    const provider = await createTestProvider(pool);

    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: "not-a-valid-key" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects duplicate active public key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();

    await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp.publicKey },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp.publicKey },
    });

    expect(res.statusCode).toBe(409);
  });

  it("requires authentication", async () => {
    const kp = generateKeypair();

    const res = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { "content-type": "application/json" },
      payload: { publicKey: kp.publicKey },
    });

    // Should fail — no auth provided, preHandler won't set identity
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/keys", () => {
  it("lists keys for the authenticated entity", async () => {
    const provider = await createTestProvider(pool);
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();

    await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp1.publicKey, label: "key-1" },
    });
    await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp2.publicKey, label: "key-2" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/keys",
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
  });

  it("only returns keys for the caller", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();

    await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp1.publicKey },
    });
    await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(consumer.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp2.publicKey },
    });

    const providerKeys = await app.inject({
      method: "GET",
      url: "/api/keys",
      headers: authHeader(provider.apiKey),
    });
    expect(providerKeys.json().data.length).toBe(1);
  });
});

describe("DELETE /api/keys/:keyId", () => {
  it("revokes a key", async () => {
    const provider = await createTestProvider(pool);
    const kp = generateKeypair();

    const createRes = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp.publicKey },
    });
    const keyId = createRes.json().data.id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/keys/${keyId}`,
      headers: authHeader(provider.apiKey),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("revoked");
  });

  it("returns 404 for another entity's key", async () => {
    const provider = await createTestProvider(pool);
    const consumer = await createTestConsumer(pool);
    const kp = generateKeypair();

    const createRes = await app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { ...authHeader(provider.apiKey), "content-type": "application/json" },
      payload: { publicKey: kp.publicKey },
    });
    const keyId = createRes.json().data.id;

    // Consumer tries to revoke provider's key
    const res = await app.inject({
      method: "DELETE",
      url: `/api/keys/${keyId}`,
      headers: authHeader(consumer.apiKey),
    });

    expect(res.statusCode).toBe(404);
  });
});
