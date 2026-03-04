import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

const mappingOpSchema = z.union([
  z.object({ op: z.literal("pick"), fields: z.array(z.string()) }),
  z.object({ op: z.literal("merge"), value: z.record(z.unknown()) }),
]);

const stepSchema = z.object({
  name: z.string().describe("Step name"),
  agentId: z.string().describe("Agent ID to invoke"),
  inputMapping: z.array(mappingOpSchema).optional().describe("Input transformation ops"),
  timeoutMs: z.number().optional().describe("Step timeout in ms"),
  metadata: z.record(z.string()).optional().describe("Step metadata"),
});

export function register(server: McpServer, clients: Clients): void {
  // --- Create Pipeline ---
  server.tool(
    "asc_pipeline_create",
    "Create a multi-agent pipeline (sequential chain of agents)",
    {
      name: z.string().describe("Pipeline name"),
      description: z.string().optional().describe("Pipeline description"),
      steps: z.array(stepSchema).describe("Ordered steps to execute"),
      priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Default priority"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.createPipeline(params as Parameters<typeof clients.consumer.createPipeline>[0]);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Pipeline ---
  server.tool(
    "asc_pipeline_get",
    "Get a pipeline definition by ID",
    {
      pipelineId: z.string().describe("Pipeline ID"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.getPipeline(params.pipelineId);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Pipelines ---
  server.tool(
    "asc_pipeline_list",
    "List all pipelines for the current consumer",
    {},
    async () => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.listPipelines();
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Delete Pipeline ---
  server.tool(
    "asc_pipeline_delete",
    "Delete a pipeline definition",
    {
      pipelineId: z.string().describe("Pipeline ID to delete"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        await clients.consumer.deletePipeline(params.pipelineId);
        return formatResult({ success: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Execute Pipeline (fire-and-forget) ---
  server.tool(
    "asc_pipeline_execute",
    "Start a pipeline execution (returns immediately with execution ID)",
    {
      pipelineId: z.string().describe("Pipeline ID to execute"),
      input: z.unknown().optional().describe("Initial input for the first step"),
      metadata: z.record(z.string()).optional().describe("Execution metadata"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const { pipelineId, ...body } = params;
        const result = await clients.consumer.executePipeline(pipelineId, body);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Execute and Wait ---
  server.tool(
    "asc_pipeline_execute_and_wait",
    "Start a pipeline and wait for all steps to complete. Returns final output.",
    {
      pipelineId: z.string().describe("Pipeline ID to execute"),
      input: z.unknown().optional().describe("Initial input for the first step"),
      timeoutMs: z.number().optional().describe("Max wait time in ms (default 120000)"),
      metadata: z.record(z.string()).optional().describe("Execution metadata"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const { pipelineId, timeoutMs, ...body } = params;
        const execution = await clients.consumer.executePipeline(pipelineId, body);
        const completed = await clients.consumer.waitForPipeline(execution.id, {
          timeoutMs: timeoutMs ?? 120_000,
        });
        return formatResult(completed);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Pipeline Execution ---
  server.tool(
    "asc_pipeline_get_execution",
    "Get a pipeline execution's status and results",
    {
      executionId: z.string().describe("Pipeline execution ID"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.getPipelineExecution(params.executionId);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Pipeline Executions ---
  server.tool(
    "asc_pipeline_list_executions",
    "List all executions for a pipeline",
    {
      pipelineId: z.string().describe("Pipeline ID"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        // Not in SDK — direct HTTP call
        const res = await fetch(
          `${clients.baseUrl}/api/pipelines/${params.pipelineId}/executions`,
          {
            headers: {
              Authorization: `Bearer ${process.env["ASC_CONSUMER_API_KEY"]}`,
            },
          }
        );
        const body = (await res.json()) as { data?: unknown; error?: { message: string } };
        if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        return formatResult(body.data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
