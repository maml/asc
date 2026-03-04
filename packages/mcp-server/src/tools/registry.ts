import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerProvider, registerConsumer } from "@asc/client";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

export function register(server: McpServer, clients: Clients): void {
  // --- Provider Registration (no auth) ---
  server.tool(
    "asc_registry_register_provider",
    "Register a new provider organization with ASC",
    {
      name: z.string().describe("Provider organization name"),
      description: z.string().describe("What this provider does"),
      contactEmail: z.string().email().describe("Contact email"),
      webhookUrl: z.string().url().describe("Webhook URL for task delivery"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        const result = await registerProvider(clients.baseUrl, params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Provider ---
  server.tool(
    "asc_registry_get_provider",
    "Get a provider's profile by ID",
    {
      providerId: z.string().describe("Provider ID to look up"),
    },
    async (params) => {
      try {
        const client = clients.consumer ?? clients.provider;
        if (!client) return formatError(new Error("No credentials configured"));
        // Use a raw fetch since neither client has getProvider(id)
        const res = await fetch(`${clients.baseUrl}/api/providers/${params.providerId}`, {
          headers: { Authorization: `Bearer ${clients.consumer ? process.env["ASC_CONSUMER_API_KEY"] : process.env["ASC_PROVIDER_API_KEY"]}` },
        });
        const body = await res.json() as { data?: unknown; error?: { message: string } };
        if (!res.ok) throw new Error((body.error as { message: string })?.message ?? `HTTP ${res.status}`);
        return formatResult(body.data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Providers ---
  server.tool(
    "asc_registry_list_providers",
    "List all registered providers",
    {
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().optional().describe("Max results"),
      status: z.string().optional().describe("Filter by status"),
    },
    async (params) => {
      try {
        if (clients.consumer) {
          const result = await clients.consumer.listProviders(params);
          return formatResult(result);
        }
        if (clients.provider) {
          const result = await clients.provider.listProviders(params);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Consumer Registration (no auth) ---
  server.tool(
    "asc_registry_register_consumer",
    "Register a new consumer organization with ASC",
    {
      name: z.string().describe("Consumer organization name"),
      description: z.string().describe("What this consumer does"),
      contactEmail: z.string().email().describe("Contact email"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        const result = await registerConsumer(clients.baseUrl, params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Consumer ---
  server.tool(
    "asc_registry_get_consumer",
    "Get a consumer's profile by ID",
    {
      consumerId: z.string().describe("Consumer ID to look up"),
    },
    async (params) => {
      try {
        const client = clients.consumer ?? clients.provider;
        if (!client) return formatError(new Error("No credentials configured"));
        const res = await fetch(`${clients.baseUrl}/api/consumers/${params.consumerId}`, {
          headers: { Authorization: `Bearer ${clients.consumer ? process.env["ASC_CONSUMER_API_KEY"] : process.env["ASC_PROVIDER_API_KEY"]}` },
        });
        const body = await res.json() as { data?: unknown; error?: { message: string } };
        if (!res.ok) throw new Error((body.error as { message: string })?.message ?? `HTTP ${res.status}`);
        return formatResult(body.data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Consumers ---
  server.tool(
    "asc_registry_list_consumers",
    "List all registered consumers (provider auth required)",
    {
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().optional().describe("Max results"),
      status: z.string().optional().describe("Filter by status"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.listConsumers(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Register Agent ---
  server.tool(
    "asc_registry_register_agent",
    "Register a new AI agent with ASC (provider auth required)",
    {
      name: z.string().describe("Agent name"),
      description: z.string().describe("What this agent does"),
      version: z.string().describe("Semantic version"),
      capabilities: z
        .array(
          z.object({
            name: z.string(),
            description: z.string(),
            inputSchema: z.record(z.unknown()),
            outputSchema: z.record(z.unknown()),
          })
        )
        .describe("Agent capabilities"),
      pricing: z
        .union([
          z.object({
            type: z.literal("per_invocation"),
            pricePerCall: z.object({ amountCents: z.number(), currency: z.string() }),
          }),
          z.object({
            type: z.literal("per_token"),
            inputPricePerToken: z.object({ amountCents: z.number(), currency: z.string() }),
            outputPricePerToken: z.object({ amountCents: z.number(), currency: z.string() }),
          }),
          z.object({
            type: z.literal("per_second"),
            pricePerSecond: z.object({ amountCents: z.number(), currency: z.string() }),
          }),
          z.object({
            type: z.literal("flat_monthly"),
            monthlyPrice: z.object({ amountCents: z.number(), currency: z.string() }),
          }),
        ])
        .describe("Pricing model"),
      sla: z
        .object({
          maxLatencyMs: z.number(),
          uptimePercentage: z.number(),
          maxErrorRate: z.number(),
        })
        .describe("SLA commitment"),
      supportsStreaming: z.boolean().describe("Whether agent supports streaming"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.registerAgent(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Agent ---
  server.tool(
    "asc_registry_get_agent",
    "Get an agent's details by ID",
    {
      agentId: z.string().describe("Agent ID"),
    },
    async (params) => {
      try {
        if (clients.consumer) {
          const result = await clients.consumer.getAgent(params.agentId);
          return formatResult(result);
        }
        if (clients.provider) {
          const result = await clients.provider.getAgent(params.agentId);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Agents (with marketplace search/filter/sort) ---
  server.tool(
    "asc_registry_list_agents",
    "Search and discover agents in the marketplace. Supports text search, filtering by status/pricing/capability, and sorting by name/date/price.",
    {
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().optional().describe("Max results"),
      status: z.string().optional().describe("Filter by status (active, draft, deprecated, disabled)"),
      capability: z.string().optional().describe("Filter by capability name"),
      providerId: z.string().optional().describe("Filter by provider ID"),
      search: z.string().optional().describe("Free-text search on agent name and description"),
      pricingType: z.enum(["per_invocation", "per_token", "per_second", "flat_monthly"]).optional().describe("Filter by pricing model"),
      sort: z.enum(["name", "created_at", "price"]).optional().describe("Sort field"),
      sortDir: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    },
    async (params) => {
      try {
        if (clients.consumer) {
          const result = await clients.consumer.listAgents(params);
          return formatResult(result);
        }
        if (clients.provider) {
          const result = await clients.provider.listAgents(params);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Agent Stats ---
  server.tool(
    "asc_registry_get_agent_stats",
    "Get usage statistics for an agent: total invocations, success rate, average latency, and 30-day revenue. Useful for evaluating agent reliability before routing work.",
    {
      agentId: z.string().describe("Agent ID to get stats for"),
    },
    async (params) => {
      try {
        if (clients.consumer) {
          const result = await clients.consumer.getAgentStats(params.agentId);
          return formatResult(result);
        }
        if (clients.provider) {
          const result = await clients.provider.getAgentStats(params.agentId);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Update Agent ---
  server.tool(
    "asc_registry_update_agent",
    "Update an agent's details (provider auth required)",
    {
      agentId: z.string().describe("Agent ID to update"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      version: z.string().optional().describe("New version"),
      status: z.string().optional().describe("New status"),
      metadata: z.record(z.string()).optional().describe("New metadata"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const { agentId, ...fields } = params;
        const result = await clients.provider.updateAgent(agentId, fields as Parameters<typeof clients.provider.updateAgent>[1]);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Delete Agent ---
  server.tool(
    "asc_registry_delete_agent",
    "Delete an agent (provider auth required)",
    {
      agentId: z.string().describe("Agent ID to delete"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        await clients.provider.deleteAgent(params.agentId);
        return formatResult({ success: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
