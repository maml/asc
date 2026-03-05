import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@asc-so/client", () => ({
  AscError: class extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;
    constructor(c: string, m: string, s: number, r: boolean) {
      super(m);
      this.code = c;
      this.statusCode = s;
      this.retryable = r;
    }
  },
  AscTimeoutError: class extends Error {
    code = "TIMEOUT";
    statusCode = 408;
    retryable = true;
    constructor(
      public taskId: string,
      public timeoutMs: number,
    ) {
      super(`Task ${taskId} did not complete within ${timeoutMs}ms`);
    }
  },
}));

import { register } from "../tools/pipeline.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
const tools = new Map<string, ToolHandler>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    tools.set(args[0] as string, args[args.length - 1] as ToolHandler);
  }),
};

const mockConsumer = {
  createPipeline: vi.fn().mockResolvedValue({ id: "pip_1", name: "test" }),
  getPipeline: vi.fn().mockResolvedValue({
    id: "pip_1",
    name: "test",
    steps: [{ name: "step1", agentId: "agent_1" }],
  }),
  listPipelines: vi.fn().mockResolvedValue({
    pipelines: [{ id: "pip_1", name: "test" }],
  }),
  deletePipeline: vi.fn().mockResolvedValue(undefined),
  executePipeline: vi.fn().mockResolvedValue({ id: "pex_1", status: "pending" }),
  getPipelineExecution: vi.fn().mockResolvedValue({
    id: "pex_1",
    status: "completed",
    output: { result: "done" },
  }),
  waitForPipeline: vi.fn().mockResolvedValue({
    id: "pex_1",
    status: "completed",
    output: { result: "done" },
  }),
  listPipelineExecutions: vi.fn().mockResolvedValue({
    executions: [{ id: "pex_1", status: "completed" }],
  }),
  listPipelineEvents: vi.fn().mockResolvedValue({
    events: [{ executionId: "pex_1", payload: { type: "pipeline_started" }, timestamp: "2026-01-01T00:00:00Z" }],
  }),
  listPipelineSteps: vi.fn().mockResolvedValue({
    steps: [{ stepIndex: 0, stepName: "step1", status: "completed" }],
  }),
};

function makeClients(withConsumer = true): Clients {
  return {
    baseUrl: "http://localhost:3100",
    consumer: withConsumer ? (mockConsumer as unknown as Clients["consumer"]) : null,
    provider: null,
  };
}

describe("pipeline tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tools.clear();
    register(mockServer as never, makeClients());
  });

  it("registers all 10 pipeline tools", () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(10);
    expect(tools.has("asc_pipeline_create")).toBe(true);
    expect(tools.has("asc_pipeline_get")).toBe(true);
    expect(tools.has("asc_pipeline_list")).toBe(true);
    expect(tools.has("asc_pipeline_delete")).toBe(true);
    expect(tools.has("asc_pipeline_execute")).toBe(true);
    expect(tools.has("asc_pipeline_execute_and_wait")).toBe(true);
    expect(tools.has("asc_pipeline_get_execution")).toBe(true);
    expect(tools.has("asc_pipeline_list_executions")).toBe(true);
    expect(tools.has("asc_pipeline_list_events")).toBe(true);
    expect(tools.has("asc_pipeline_list_steps")).toBe(true);
  });

  // --- asc_pipeline_create ---
  describe("asc_pipeline_create", () => {
    it("calls consumer.createPipeline with params", async () => {
      const handler = tools.get("asc_pipeline_create")!;
      const params = {
        name: "my-pipeline",
        steps: [{ name: "step1", agentId: "agent_1" }],
      };
      const result = await handler(params);
      expect(mockConsumer.createPipeline).toHaveBeenCalledWith(params);
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ id: "pip_1", name: "test" }, null, 2) }],
      });
    });
  });

  // --- asc_pipeline_get ---
  describe("asc_pipeline_get", () => {
    it("calls consumer.getPipeline with pipelineId", async () => {
      const handler = tools.get("asc_pipeline_get")!;
      const result = await handler({ pipelineId: "pip_1" });
      expect(mockConsumer.getPipeline).toHaveBeenCalledWith("pip_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: "pip_1", name: "test", steps: [{ name: "step1", agentId: "agent_1" }] },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_list ---
  describe("asc_pipeline_list", () => {
    it("calls consumer.listPipelines", async () => {
      const handler = tools.get("asc_pipeline_list")!;
      const result = await handler({});
      expect(mockConsumer.listPipelines).toHaveBeenCalled();
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ pipelines: [{ id: "pip_1", name: "test" }] }, null, 2),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_delete ---
  describe("asc_pipeline_delete", () => {
    it("calls consumer.deletePipeline and returns success:true", async () => {
      const handler = tools.get("asc_pipeline_delete")!;
      const result = await handler({ pipelineId: "pip_1" });
      expect(mockConsumer.deletePipeline).toHaveBeenCalledWith("pip_1");
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
      });
    });
  });

  // --- asc_pipeline_execute ---
  describe("asc_pipeline_execute", () => {
    it("calls consumer.executePipeline with pipelineId and body", async () => {
      const handler = tools.get("asc_pipeline_execute")!;
      const result = await handler({
        pipelineId: "pip_1",
        input: { doc: "hello" },
        metadata: { source: "test" },
      });
      expect(mockConsumer.executePipeline).toHaveBeenCalledWith("pip_1", {
        input: { doc: "hello" },
        metadata: { source: "test" },
      });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: "pex_1", status: "pending" }, null, 2),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_execute_and_wait ---
  describe("asc_pipeline_execute_and_wait", () => {
    it("calls executePipeline then waitForPipeline", async () => {
      const handler = tools.get("asc_pipeline_execute_and_wait")!;
      const result = await handler({
        pipelineId: "pip_1",
        input: { doc: "hello" },
        timeoutMs: 30000,
      });
      expect(mockConsumer.executePipeline).toHaveBeenCalledWith("pip_1", {
        input: { doc: "hello" },
      });
      expect(mockConsumer.waitForPipeline).toHaveBeenCalledWith("pex_1", {
        timeoutMs: 30000,
      });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: "pex_1", status: "completed", output: { result: "done" } },
              null,
              2,
            ),
          },
        ],
      });
    });

    it("uses default 120000ms timeout when none provided", async () => {
      const handler = tools.get("asc_pipeline_execute_and_wait")!;
      await handler({ pipelineId: "pip_1" });
      expect(mockConsumer.waitForPipeline).toHaveBeenCalledWith("pex_1", {
        timeoutMs: 120_000,
      });
    });

    it("returns timeout error when waitForPipeline throws AscTimeoutError", async () => {
      const { AscTimeoutError } = await import("@asc-so/client");
      mockConsumer.waitForPipeline.mockRejectedValueOnce(
        new AscTimeoutError("pex_1", 5000),
      );
      const handler = tools.get("asc_pipeline_execute_and_wait")!;
      const result = (await handler({
        pipelineId: "pip_1",
        timeoutMs: 5000,
      })) as { content: Array<{ text: string }>; isError?: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Timeout");
      expect(result.content[0].text).toContain("pex_1");
    });
  });

  // --- asc_pipeline_get_execution ---
  describe("asc_pipeline_get_execution", () => {
    it("calls consumer.getPipelineExecution with executionId", async () => {
      const handler = tools.get("asc_pipeline_get_execution")!;
      const result = await handler({ executionId: "pex_1" });
      expect(mockConsumer.getPipelineExecution).toHaveBeenCalledWith("pex_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: "pex_1", status: "completed", output: { result: "done" } },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_list_executions (refactored to use SDK) ---
  describe("asc_pipeline_list_executions", () => {
    it("calls consumer.listPipelineExecutions with pipelineId", async () => {
      const handler = tools.get("asc_pipeline_list_executions")!;
      const result = await handler({ pipelineId: "pip_1" });
      expect(mockConsumer.listPipelineExecutions).toHaveBeenCalledWith("pip_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { executions: [{ id: "pex_1", status: "completed" }] },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_list_events ---
  describe("asc_pipeline_list_events", () => {
    it("calls consumer.listPipelineEvents with executionId", async () => {
      const handler = tools.get("asc_pipeline_list_events")!;
      const result = await handler({ executionId: "pex_1" });
      expect(mockConsumer.listPipelineEvents).toHaveBeenCalledWith("pex_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { events: [{ executionId: "pex_1", payload: { type: "pipeline_started" }, timestamp: "2026-01-01T00:00:00Z" }] },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  // --- asc_pipeline_list_steps ---
  describe("asc_pipeline_list_steps", () => {
    it("calls consumer.listPipelineSteps with executionId", async () => {
      const handler = tools.get("asc_pipeline_list_steps")!;
      const result = await handler({ executionId: "pex_1" });
      expect(mockConsumer.listPipelineSteps).toHaveBeenCalledWith("pex_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { steps: [{ stepIndex: 0, stepName: "step1", status: "completed" }] },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  // --- No consumer returns error ---
  describe("no consumer", () => {
    it("returns error when consumer is null", async () => {
      tools.clear();
      register(mockServer as never, makeClients(false));

      for (const toolName of [
        "asc_pipeline_create",
        "asc_pipeline_get",
        "asc_pipeline_list",
        "asc_pipeline_delete",
        "asc_pipeline_execute",
        "asc_pipeline_execute_and_wait",
        "asc_pipeline_get_execution",
        "asc_pipeline_list_executions",
        "asc_pipeline_list_events",
        "asc_pipeline_list_steps",
      ]) {
        const handler = tools.get(toolName)!;
        const result = (await handler({ pipelineId: "pip_1" })) as {
          content: Array<{ text: string }>;
          isError?: boolean;
        };
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Consumer credentials required");
      }
    });
  });
});
