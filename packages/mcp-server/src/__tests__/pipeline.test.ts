import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@asc/client", () => ({
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

  it("registers all 8 pipeline tools", () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(8);
    expect(tools.has("asc_pipeline_create")).toBe(true);
    expect(tools.has("asc_pipeline_get")).toBe(true);
    expect(tools.has("asc_pipeline_list")).toBe(true);
    expect(tools.has("asc_pipeline_delete")).toBe(true);
    expect(tools.has("asc_pipeline_execute")).toBe(true);
    expect(tools.has("asc_pipeline_execute_and_wait")).toBe(true);
    expect(tools.has("asc_pipeline_get_execution")).toBe(true);
    expect(tools.has("asc_pipeline_list_executions")).toBe(true);
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
      const { AscTimeoutError } = await import("@asc/client");
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

  // --- asc_pipeline_list_executions ---
  describe("asc_pipeline_list_executions", () => {
    const originalFetch = globalThis.fetch;
    let savedKey: string | undefined;

    beforeEach(() => {
      savedKey = process.env["ASC_CONSUMER_API_KEY"];
      process.env["ASC_CONSUMER_API_KEY"] = "asc_test_key_123";
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (savedKey !== undefined) {
        process.env["ASC_CONSUMER_API_KEY"] = savedKey;
      } else {
        delete process.env["ASC_CONSUMER_API_KEY"];
      }
    });

    it("fetches /api/pipelines/:id/executions with auth header", async () => {
      const executions = [
        { id: "pex_1", status: "completed" },
        { id: "pex_2", status: "pending" },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: executions }),
      }) as unknown as typeof fetch;

      const handler = tools.get("asc_pipeline_list_executions")!;
      const result = await handler({ pipelineId: "pip_1" });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3100/api/pipelines/pip_1/executions",
        {
          headers: {
            Authorization: "Bearer asc_test_key_123",
          },
        },
      );
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(executions, null, 2) }],
      });
    });

    it("returns error when fetch fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Internal server error" } }),
      }) as unknown as typeof fetch;

      const handler = tools.get("asc_pipeline_list_executions")!;
      const result = (await handler({ pipelineId: "pip_1" })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Internal server error");
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
