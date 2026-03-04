import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Clients } from "../clients.js";
import { formatResult, formatError } from "../util/errors.js";

export function register(server: McpServer, clients: Clients): void {
  // --- Submit Coordination (fire-and-forget) ---
  server.tool(
    "asc_coordination_submit",
    "Submit a task to an agent (fire-and-forget, returns immediately with task ID)",
    {
      agentId: z.string().describe("Target agent ID"),
      input: z.unknown().describe("Input payload for the agent"),
      priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority"),
      callbackUrl: z.string().url().optional().describe("Webhook for completion notification"),
      timeoutMs: z.number().optional().describe("Task timeout in milliseconds"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.submit(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Invoke and Wait ---
  server.tool(
    "asc_coordination_invoke_and_wait",
    "Submit a task and wait for completion. Returns the completed task with output.",
    {
      agentId: z.string().describe("Target agent ID"),
      input: z.unknown().describe("Input payload for the agent"),
      priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority"),
      timeoutMs: z.number().optional().describe("Max wait time in ms (default 30000)"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const { timeoutMs, ...submitParams } = params;
        const { task } = await clients.consumer.submit(submitParams);
        const completed = await clients.consumer.waitForCompletion(task.id, {
          timeoutMs: timeoutMs ?? 30_000,
        });
        return formatResult(completed);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Get Task ---
  server.tool(
    "asc_coordination_get_task",
    "Get a task's current status and result",
    {
      taskId: z.string().describe("Task ID"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.getTask(params.taskId);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Tasks ---
  server.tool(
    "asc_coordination_list_tasks",
    "List tasks with optional filters",
    {
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().optional().describe("Max results"),
      agentId: z.string().optional().describe("Filter by agent"),
      status: z.string().optional().describe("Filter by status"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const result = await clients.consumer.listTasks(params);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- List Coordination Events ---
  server.tool(
    "asc_coordination_list_events",
    "List events for a coordination (task lifecycle, circuit breaker, SLA violations)",
    {
      coordinationId: z.string().describe("Coordination ID"),
      cursor: z.string().optional().describe("Pagination cursor"),
      limit: z.number().optional().describe("Max results"),
    },
    async (params) => {
      try {
        if (!clients.consumer) return formatError(new Error("Consumer credentials required"));
        const { coordinationId, ...opts } = params;
        const result = await clients.consumer.listEvents(coordinationId, opts);
        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
