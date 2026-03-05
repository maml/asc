import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { register } from "../tools/coordination.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
const tools = new Map<string, ToolHandler>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    tools.set(args[0] as string, args[args.length - 1] as ToolHandler);
  }),
};

// --- Mock consumer ---
const mockConsumer = {
  submit: vi.fn().mockResolvedValue({
    coordinationId: "crd_1",
    task: { id: "tsk_1", status: "pending" },
  }),
  waitForCompletion: vi.fn().mockResolvedValue({
    id: "tsk_1",
    status: "completed",
    output: { result: "done" },
  }),
  getTask: vi.fn().mockResolvedValue({
    id: "tsk_1",
    status: "completed",
    output: { result: "done" },
  }),
  listTasks: vi.fn().mockResolvedValue({
    tasks: [{ id: "tsk_1", status: "completed" }],
    pagination: { cursor: null, hasMore: false },
  }),
  listEvents: vi.fn().mockResolvedValue({
    events: [{ id: "evt_1", type: "task.created" }],
    pagination: { cursor: null, hasMore: false },
  }),
};

function clientsWith(consumer: unknown): Clients {
  return { baseUrl: "http://localhost:3100", consumer, provider: null } as Clients;
}

describe("coordination tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tools.clear();
  });

  function registerTools(consumer: unknown = mockConsumer) {
    register(mockServer as any, clientsWith(consumer));
  }

  it("registers 5 tools", () => {
    registerTools();
    expect(mockServer.tool).toHaveBeenCalledTimes(5);
    expect(tools.has("asc_coordination_submit")).toBe(true);
    expect(tools.has("asc_coordination_invoke_and_wait")).toBe(true);
    expect(tools.has("asc_coordination_get_task")).toBe(true);
    expect(tools.has("asc_coordination_list_tasks")).toBe(true);
    expect(tools.has("asc_coordination_list_events")).toBe(true);
  });

  describe("asc_coordination_submit", () => {
    it("calls consumer.submit and returns the task", async () => {
      registerTools();
      const handler = tools.get("asc_coordination_submit")!;
      const result = await handler({ agentId: "agent_1", input: { text: "hello" } });

      expect(mockConsumer.submit).toHaveBeenCalledWith({
        agentId: "agent_1",
        input: { text: "hello" },
      });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { coordinationId: "crd_1", task: { id: "tsk_1", status: "pending" } },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  describe("asc_coordination_invoke_and_wait", () => {
    it("calls consumer.submit then waitForCompletion and returns completed task", async () => {
      registerTools();
      const handler = tools.get("asc_coordination_invoke_and_wait")!;
      const result = await handler({
        agentId: "agent_1",
        input: { text: "hello" },
        timeoutMs: 5000,
      });

      expect(mockConsumer.submit).toHaveBeenCalledWith({
        agentId: "agent_1",
        input: { text: "hello" },
      });
      expect(mockConsumer.waitForCompletion).toHaveBeenCalledWith("tsk_1", {
        timeoutMs: 5000,
      });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: "tsk_1", status: "completed", output: { result: "done" } },
              null,
              2,
            ),
          },
        ],
      });
    });

    it("returns isError with timeout message when waitForCompletion throws AscTimeoutError", async () => {
      // Import the mocked class to throw it
      const { AscTimeoutError } = await import("@asc-so/client");
      mockConsumer.waitForCompletion.mockRejectedValueOnce(
        new AscTimeoutError("tsk_1", 5000),
      );
      registerTools();
      const handler = tools.get("asc_coordination_invoke_and_wait")!;
      const result = await handler({
        agentId: "agent_1",
        input: { text: "hello" },
        timeoutMs: 5000,
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Timeout: Task tsk_1 did not complete within 5000ms\nYou can check the result later using the task ID.",
          },
        ],
        isError: true,
      });
    });
  });

  describe("asc_coordination_get_task", () => {
    it("calls consumer.getTask with the taskId", async () => {
      registerTools();
      const handler = tools.get("asc_coordination_get_task")!;
      const result = await handler({ taskId: "tsk_1" });

      expect(mockConsumer.getTask).toHaveBeenCalledWith("tsk_1");
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { id: "tsk_1", status: "completed", output: { result: "done" } },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  describe("asc_coordination_list_tasks", () => {
    it("calls consumer.listTasks with filter params", async () => {
      registerTools();
      const handler = tools.get("asc_coordination_list_tasks")!;
      const result = await handler({ status: "completed", limit: 10 });

      expect(mockConsumer.listTasks).toHaveBeenCalledWith({ status: "completed", limit: 10 });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                tasks: [{ id: "tsk_1", status: "completed" }],
                pagination: { cursor: null, hasMore: false },
              },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  describe("asc_coordination_list_events", () => {
    it("calls consumer.listEvents with coordinationId and options", async () => {
      registerTools();
      const handler = tools.get("asc_coordination_list_events")!;
      const result = await handler({ coordinationId: "crd_1", limit: 5 });

      expect(mockConsumer.listEvents).toHaveBeenCalledWith("crd_1", { limit: 5 });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                events: [{ id: "evt_1", type: "task.created" }],
                pagination: { cursor: null, hasMore: false },
              },
              null,
              2,
            ),
          },
        ],
      });
    });
  });

  describe("no consumer", () => {
    it("returns an error when consumer is null", async () => {
      registerTools(null);
      const handler = tools.get("asc_coordination_submit")!;
      const result = await handler({ agentId: "agent_1", input: {} });

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: Consumer credentials required" }],
        isError: true,
      });
    });
  });
});
