import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

export function register(server: McpServer, clients: Clients): void {
  // --- List Traces ---
  server.tool(
    "asc_observability_list_traces",
    "List execution traces for debugging and monitoring",
    {
      limit: z.number().optional().describe("Max results"),
      offset: z.string().optional().describe("Pagination offset"),
    },
    async (params) => {
      try {
        if (clients.provider) {
          const result = await clients.provider.listTraces(params);
          return formatResult(result);
        }
        if (clients.consumer) {
          const result = await clients.consumer.listTraces(params);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Trace ---
  server.tool(
    "asc_observability_get_trace",
    "Get a full trace with all spans",
    {
      traceId: z.string().describe("Trace ID"),
    },
    async (params) => {
      try {
        if (clients.provider) {
          const result = await clients.provider.getTrace(params.traceId);
          return formatResult(result);
        }
        if (clients.consumer) {
          const result = await clients.consumer.getTrace(params.traceId);
          return formatResult(result);
        }
        return formatError(new Error("No credentials configured"));
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Create SLA Rule ---
  server.tool(
    "asc_observability_create_sla_rule",
    "Create an SLA monitoring rule for an agent (provider auth required)",
    {
      agentId: z.string().describe("Agent ID to monitor"),
      metricType: z.enum(["latency", "uptime", "error_rate", "throughput"]).describe("Metric to track"),
      threshold: z.number().describe("Threshold value"),
      windowMinutes: z.number().optional().describe("Evaluation window in minutes"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.createSlaRule({
          ...params,
          providerId: clients.provider.providerId,
        });
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List SLA Rules ---
  server.tool(
    "asc_observability_list_sla_rules",
    "List SLA rules with optional agent filter (provider auth required)",
    {
      agentId: z.string().optional().describe("Filter by agent ID"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.listSlaRules(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Delete SLA Rule ---
  server.tool(
    "asc_observability_delete_sla_rule",
    "Delete an SLA rule (provider auth required)",
    {
      ruleId: z.string().describe("SLA rule ID to delete"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        await clients.provider.deleteSlaRule(params.ruleId);
        return formatResult({ success: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Evaluate SLA ---
  server.tool(
    "asc_observability_evaluate_sla",
    "Evaluate SLA compliance for an agent (provider auth required)",
    {
      agentId: z.string().describe("Agent ID to evaluate"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.evaluateSlaRules(params.agentId);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Create Quality Gate ---
  server.tool(
    "asc_observability_create_quality_gate",
    "Create a quality gate for an agent (provider auth required)",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Gate name"),
      description: z.string().optional().describe("Gate description"),
      checkConfig: z.union([
        z.object({ type: z.literal("json_schema"), schema: z.record(z.unknown()) }),
        z.object({ type: z.literal("latency_threshold"), maxMs: z.number() }),
        z.object({ type: z.literal("output_regex"), pattern: z.string(), flags: z.string().optional() }),
        z.object({ type: z.literal("custom_webhook"), url: z.string(), timeoutMs: z.number() }),
      ]).describe("Quality check configuration"),
      required: z.boolean().optional().describe("Whether this gate is required (default true)"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.createQualityGate(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Quality Gates ---
  server.tool(
    "asc_observability_list_quality_gates",
    "List quality gates with optional agent filter (provider auth required)",
    {
      agentId: z.string().optional().describe("Filter by agent ID"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.listQualityGates(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Delete Quality Gate ---
  server.tool(
    "asc_observability_delete_quality_gate",
    "Delete a quality gate (provider auth required)",
    {
      gateId: z.string().describe("Quality gate ID to delete"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        await clients.provider.deleteQualityGate(params.gateId);
        return formatResult({ success: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Quality Checks ---
  server.tool(
    "asc_observability_list_quality_checks",
    "List quality check results (provider auth required)",
    {
      gateId: z.string().optional().describe("Filter by gate ID"),
      taskId: z.string().optional().describe("Filter by task ID"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.provider) return formatError(new Error("Provider credentials required"));
        const result = await clients.provider.listQualityChecks(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
