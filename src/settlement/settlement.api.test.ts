import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain, authHeader } from "../test/helpers.js";
import { clearAuthCache } from "../auth/hook.js";
import { buildApp, type AppContext } from "../app.js";

const pool = getTestPool();
let ctx: AppContext;

beforeAll(async () => {
  ctx = await buildApp(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
  clearAuthCache();
});

describe("settlement routes", () => {
  describe("provider settlement config", () => {
    it("PUT creates and GET retrieves config", async () => {
      const { provider } = await createFullEntityChain(pool);

      const putRes = await ctx.app.inject({
        method: "PUT",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
        payload: {
          network: "lightning",
          lightningAddress: "user@strike.me",
          enabled: true,
        },
      });
      expect(putRes.statusCode).toBe(200);
      const putBody = putRes.json() as { data: { config: Record<string, unknown> } };
      expect(putBody.data.config.network).toBe("lightning");
      expect(putBody.data.config.lightningAddress).toBe("user@strike.me");
      expect(putBody.data.config.enabled).toBe(true);

      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = getRes.json() as { data: { config: Record<string, unknown> } };
      expect(getBody.data.config.network).toBe("lightning");
    });

    it("GET returns 404 when no config exists", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(404);
    });

    it("DELETE removes config", async () => {
      const { provider } = await createFullEntityChain(pool);

      await ctx.app.inject({
        method: "PUT",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
        payload: { network: "noop", enabled: true },
      });

      const deleteRes = await ctx.app.inject({
        method: "DELETE",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
      });
      expect(deleteRes.statusCode).toBe(200);

      const getRes = await ctx.app.inject({
        method: "GET",
        url: `/api/providers/${provider.id}/settlement-config`,
        headers: authHeader(provider.apiKey),
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("settlement listing", () => {
    it("GET /api/settlements returns empty list initially", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/settlements",
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: { settlements: unknown[] } };
      expect(body.data.settlements).toEqual([]);
    });

    it("GET /api/settlements/:id returns 404 for nonexistent", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/settlements/stl_nonexistent",
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("settlement summary", () => {
    it("GET /api/settlements/summary requires periodStart and periodEnd", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "GET",
        url: "/api/settlements/summary",
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(400);
    });

    it("GET /api/settlements/summary returns zeroes when empty", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "GET",
        url: `/api/settlements/summary?periodStart=${new Date(Date.now() - 86400000).toISOString()}&periodEnd=${new Date(Date.now() + 86400000).toISOString()}`,
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: { summary: Record<string, unknown> } };
      expect(body.data.summary.settlementCount).toBe(0);
      expect(body.data.summary.totalGrossCents).toBe(0);
    });
  });

  describe("reconciliation", () => {
    it("POST /api/settlements/reconcile returns result", async () => {
      const { provider } = await createFullEntityChain(pool);

      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/settlements/reconcile",
        headers: authHeader(provider.apiKey),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: { result: Record<string, unknown> } };
      expect(body.data.result.attempted).toBe(0);
      expect(body.data.result.settled).toBe(0);
      expect(body.data.result.failed).toBe(0);
    });
  });
});
