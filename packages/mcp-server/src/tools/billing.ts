import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

export function register(server: McpServer, clients: Clients): void {
  // --- List Billing Events ---
  server.tool(
    "asc_billing_list_events",
    "List billing events (invocations, adjustments, refunds)",
    {
      agentId: z.string().optional().describe("Filter by agent ID"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.listBillingEvents(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Usage Summary ---
  server.tool(
    "asc_billing_get_usage",
    "Get usage summary for a time period",
    {
      periodStart: z.string().describe("Start date (ISO 8601)"),
      periodEnd: z.string().describe("End date (ISO 8601)"),
      agentId: z.string().optional().describe("Filter by agent ID"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.getUsageSummary(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Month-to-Date Spend ---
  server.tool(
    "asc_billing_get_mtd",
    "Get current month-to-date spending",
    {},
    async () => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.getMonthToDateSpend();
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Create Invoice ---
  server.tool(
    "asc_billing_create_invoice",
    "Generate an invoice for a billing period",
    {
      periodStart: z.string().describe("Billing period start (ISO 8601)"),
      periodEnd: z.string().describe("Billing period end (ISO 8601)"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const res = await fetch(`${clients.baseUrl}/api/invoices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env["ASC_CONSUMER_API_KEY"]}`,
          },
          body: JSON.stringify({
            consumerId: clients.consumer.consumerId,
            ...params,
          }),
        });
        const body = (await res.json()) as { data?: unknown; error?: { message: string } };
        if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        return formatResult(body.data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Invoices ---
  server.tool(
    "asc_billing_list_invoices",
    "List invoices with optional status filter",
    {
      status: z.string().optional().describe("Filter by status (draft, issued, paid, overdue)"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const qs = new URLSearchParams();
        qs.set("consumerId", clients.consumer.consumerId);
        if (params.status) qs.set("status", params.status);
        if (params.limit) qs.set("limit", String(params.limit));
        const res = await fetch(`${clients.baseUrl}/api/invoices?${qs}`, {
          headers: {
            Authorization: `Bearer ${process.env["ASC_CONSUMER_API_KEY"]}`,
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
