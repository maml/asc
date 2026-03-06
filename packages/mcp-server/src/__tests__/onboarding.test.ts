import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @asc-so/client
vi.mock("@asc-so/client", () => ({
  registerProvider: vi.fn(),
  registerConsumer: vi.fn(),
  AscError: class AscError extends Error {
    code: string;
    statusCode: number;
    retryable: boolean;
    constructor(code: string, msg: string, status: number, retryable: boolean) {
      super(msg);
      this.code = code;
      this.statusCode = status;
      this.retryable = retryable;
    }
  },
  AscTimeoutError: class extends Error {},
}));

// Mock config and config-writer
vi.mock("../config.js", () => ({
  getConfigStatus: vi.fn(),
}));

vi.mock("../config-writer.js", () => ({
  writeConfig: vi.fn(),
}));

import { registerProvider, registerConsumer } from "@asc-so/client";
import { getConfigStatus } from "../config.js";
import { writeConfig } from "../config-writer.js";
import { register } from "../tools/onboarding.js";
import type { Clients } from "../clients.js";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
type PromptHandler = () => unknown;

const tools = new Map<string, ToolHandler>();
const prompts = new Map<string, PromptHandler>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    const name = args[0] as string;
    const handler = args[args.length - 1] as ToolHandler;
    tools.set(name, handler);
  }),
  prompt: vi.fn((...args: unknown[]) => {
    const name = args[0] as string;
    const handler = args[args.length - 1] as PromptHandler;
    prompts.set(name, handler);
  }),
};

function makeClients(overrides: Partial<Clients> = {}): Clients {
  return {
    baseUrl: "http://localhost:3100",
    consumer: {
      consumerId: "con_test" as any,
      listAgents: vi.fn(),
      listPipelines: vi.fn(),
    } as any,
    provider: {
      providerId: "prv_test" as any,
      listAgents: vi.fn(),
    } as any,
    ...overrides,
  };
}

function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("onboarding tools", () => {
  beforeEach(() => {
    tools.clear();
    prompts.clear();
    mockServer.tool.mockClear();
    mockServer.prompt.mockClear();
    vi.restoreAllMocks();
  });

  it("registers 3 tools and 1 prompt", () => {
    register(mockServer as any, makeClients());
    expect(mockServer.tool).toHaveBeenCalledTimes(3);
    expect(mockServer.prompt).toHaveBeenCalledTimes(1);
    expect(tools.has("asc_onboard")).toBe(true);
    expect(tools.has("asc_sandbox_status")).toBe(true);
    expect(tools.has("asc_sandbox_explore")).toBe(true);
    expect(prompts.has("asc_get_started")).toBe(true);
  });

  // --- asc_get_started prompt ---
  describe("asc_get_started", () => {
    it("returns welcome text when not configured", () => {
      (getConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        configFileExists: false,
        configFilePath: "/home/user/.config/asc/config.toml",
        activeEnvironment: null,
        hasConsumer: false,
        hasProvider: false,
        isFullyConfigured: false,
      });

      register(mockServer as any, makeClients());
      const handler = prompts.get("asc_get_started")!;
      const result = handler() as any;

      expect(result.messages[0].content.text).toContain("Welcome to ASC");
      expect(result.messages[0].content.text).toContain("asc_onboard");
    });

    it("returns quick reference when fully configured", () => {
      (getConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        configFileExists: true,
        configFilePath: "/home/user/.config/asc/config.toml",
        activeEnvironment: "sandbox",
        hasConsumer: true,
        hasProvider: true,
        isFullyConfigured: true,
      });

      register(mockServer as any, makeClients());
      const handler = prompts.get("asc_get_started")!;
      const result = handler() as any;

      expect(result.messages[0].content.text).toContain("fully configured");
      expect(result.messages[0].content.text).toContain("Quick reference");
    });

    it("shows what's missing when partially configured", () => {
      (getConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        configFileExists: true,
        configFilePath: "/home/user/.config/asc/config.toml",
        activeEnvironment: "sandbox",
        hasConsumer: true,
        hasProvider: false,
        isFullyConfigured: false,
      });

      register(mockServer as any, makeClients());
      const handler = prompts.get("asc_get_started")!;
      const result = handler() as any;

      expect(result.messages[0].content.text).toContain("missing provider");
    });
  });

  // --- asc_onboard ---
  describe("asc_onboard", () => {
    it("registers consumer when role=consumer", async () => {
      const consumerResult = { consumer: { id: "con_new" }, apiKey: "asc_test_key" };
      (registerConsumer as ReturnType<typeof vi.fn>).mockResolvedValue(consumerResult);
      (writeConfig as ReturnType<typeof vi.fn>).mockReturnValue({ path: "/home/user/.config/asc/config.toml" });

      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "sandbox",
        role: "consumer",
        name: "TestOrg",
        contactEmail: "test@example.com",
      });

      expect(registerConsumer).toHaveBeenCalledWith("https://preview-api.asc.so", {
        name: "TestOrg",
        description: "TestOrg consumer",
        contactEmail: "test@example.com",
      });
      expect(registerProvider).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("con_new");
      expect(result.content[0].text).toContain("asc_test_key");
    });

    it("requires webhookUrl for provider role", async () => {
      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "sandbox",
        role: "provider",
        name: "TestOrg",
        contactEmail: "test@example.com",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("webhookUrl is required");
    });

    it("registers both consumer and provider when role=both", async () => {
      const consumerResult = { consumer: { id: "con_new" }, apiKey: "asc_cons_key" };
      const providerResult = { provider: { id: "prv_new" }, apiKey: "asc_prov_key" };
      (registerConsumer as ReturnType<typeof vi.fn>).mockResolvedValue(consumerResult);
      (registerProvider as ReturnType<typeof vi.fn>).mockResolvedValue(providerResult);
      (writeConfig as ReturnType<typeof vi.fn>).mockReturnValue({ path: "/config/path" });

      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "sandbox",
        role: "both",
        name: "TestOrg",
        contactEmail: "test@example.com",
        webhookUrl: "https://example.com/hook",
      });

      expect(registerConsumer).toHaveBeenCalled();
      expect(registerProvider).toHaveBeenCalled();
      expect(result.content[0].text).toContain("con_new");
      expect(result.content[0].text).toContain("prv_new");
    });

    it("requires baseUrl for self_hosted environment", async () => {
      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "self_hosted",
        role: "consumer",
        name: "TestOrg",
        contactEmail: "test@example.com",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("baseUrl is required");
    });

    it("handles registration failure gracefully", async () => {
      (registerConsumer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection refused"));

      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "sandbox",
        role: "consumer",
        name: "TestOrg",
        contactEmail: "test@example.com",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection refused");
    });

    it("returns credentials with warning when config write fails", async () => {
      const consumerResult = { consumer: { id: "con_new" }, apiKey: "asc_key" };
      (registerConsumer as ReturnType<typeof vi.fn>).mockResolvedValue(consumerResult);
      (writeConfig as ReturnType<typeof vi.fn>).mockReturnValue({ error: "Permission denied" });

      register(mockServer as any, makeClients());
      const handler = tools.get("asc_onboard")!;
      const result: any = await handler({
        environment: "sandbox",
        role: "consumer",
        name: "TestOrg",
        contactEmail: "test@example.com",
      });

      // Should still show credentials even if write failed
      expect(result.content[0].text).toContain("con_new");
      expect(result.content[0].text).toContain("asc_key");
      expect(result.content[0].text).toContain("Warning");
      expect(result.content[0].text).toContain("Permission denied");
    });
  });

  // --- asc_sandbox_status ---
  describe("asc_sandbox_status", () => {
    it("returns config status", async () => {
      (getConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        configFileExists: true,
        configFilePath: "/config/path",
        activeEnvironment: "sandbox",
        hasConsumer: true,
        hasProvider: true,
        isFullyConfigured: true,
      });

      const clients = makeClients();
      (clients.consumer!.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ id: "agt_1" }] });

      register(mockServer as any, clients);
      const handler = tools.get("asc_sandbox_status")!;
      const result = parseResult(await handler({}));

      expect(result.configFileExists).toBe(true);
      expect(result.activeEnvironment).toBe("sandbox");
      expect(result.isFullyConfigured).toBe(true);
      expect(result.connected).toBe(true);
    });
  });

  // --- asc_sandbox_explore ---
  describe("asc_sandbox_explore", () => {
    it("returns error when no credentials", async () => {
      const clients = makeClients({ consumer: null, provider: null });
      register(mockServer as any, clients);
      const handler = tools.get("asc_sandbox_explore")!;
      const result: any = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No credentials configured");
    });

    it("lists agents and pipelines when configured", async () => {
      const clients = makeClients();
      const agents = { data: [{ id: "agt_1", name: "EchoAgent" }] };
      const pipelines = { data: [{ id: "pip_1", name: "NDA Review" }] };
      (clients.consumer!.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue(agents);
      (clients.consumer!.listPipelines as ReturnType<typeof vi.fn>).mockResolvedValue(pipelines);

      register(mockServer as any, clients);
      const handler = tools.get("asc_sandbox_explore")!;
      const result = parseResult(await handler({}));

      expect(result.agents).toEqual(agents);
      expect(result.pipelines).toEqual(pipelines);
    });
  });
});
