import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

export function register(server: McpServer, clients: Clients): void {
  // --- List Settlements ---
  server.tool(
    "asc_settlement_list",
    "List settlements with optional filters (provider, consumer, status, network)",
    {
      providerId: z.string().optional().describe("Filter by provider ID"),
      consumerId: z.string().optional().describe("Filter by consumer ID"),
      status: z.string().optional().describe("Filter by status (pending, processing, settled, failed)"),
      network: z.string().optional().describe("Filter by network (lightning, liquid, stripe, noop)"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (clients.provider) {
          const result = await clients.provider.listSettlements(params);
          return formatResult(result);
        }
        if (clients.consumer) {
          const result = await clients.consumer.listSettlements(params);
          return formatResult(result);
        }
        return formatError(new Error("Provider or consumer credentials required"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Settlement Summary ---
  server.tool(
    "asc_settlement_get_summary",
    "Get settlement summary for a time period",
    {
      periodStart: z.string().describe("Start date (ISO 8601)"),
      periodEnd: z.string().describe("End date (ISO 8601)"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.getSettlementSummary(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Provider Settlement Config ---
  server.tool(
    "asc_settlement_get_config",
    "Get the current provider settlement configuration",
    {},
    async () => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.getSettlementConfig();
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Update Provider Settlement Config ---
  server.tool(
    "asc_settlement_update_config",
    "Update provider settlement configuration (network, addresses, enabled)",
    {
      network: z.enum(["lightning", "liquid", "stripe", "noop"]).describe("Settlement network"),
      lightningAddress: z.string().optional().describe("Lightning address (user@domain)"),
      liquidAddress: z.string().optional().describe("Liquid network address"),
      stripeConnectAccountId: z.string().optional().describe("Stripe Connect account ID"),
      enabled: z.boolean().optional().describe("Enable/disable settlement"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.updateSettlementConfig(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Reconcile Pending Settlements ---
  server.tool(
    "asc_settlement_reconcile",
    "Trigger reconciliation of pending/failed settlements",
    {},
    async () => {
      try {
        const baseUrl = clients.baseUrl;
        const apiKey = process.env["ASC_PROVIDER_API_KEY"] ?? process.env["ASC_CONSUMER_API_KEY"];
        if (!apiKey) return formatError(new Error("API key required"));
        const res = await fetch(`${baseUrl}/api/settlements/reconcile`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        const body = (await res.json()) as { data?: unknown; error?: { message: string } };
        if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        return formatResult(body.data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
