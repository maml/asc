import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";

// Mock fs and smol-toml so we can control file reads
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn() };
});

import { readFileSync } from "node:fs";
import { loadConfig, getConfigFilePath, getConfigStatus } from "../config.js";

const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

describe("getConfigFilePath", () => {
  afterEach(() => {
    delete process.env["XDG_CONFIG_HOME"];
  });

  it("uses XDG_CONFIG_HOME when set", () => {
    process.env["XDG_CONFIG_HOME"] = "/custom/config";
    expect(getConfigFilePath()).toBe("/custom/config/asc/config.toml");
  });

  it("defaults to ~/.config when XDG_CONFIG_HOME is not set", () => {
    delete process.env["XDG_CONFIG_HOME"];
    expect(getConfigFilePath()).toBe(join(homedir(), ".config", "asc", "config.toml"));
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    delete process.env["ASC_BASE_URL"];
    delete process.env["ASC_CONSUMER_API_KEY"];
    delete process.env["ASC_CONSUMER_ID"];
    delete process.env["ASC_PROVIDER_API_KEY"];
    delete process.env["ASC_PROVIDER_ID"];
    vi.restoreAllMocks();
  });

  it("defaults baseUrl to api.asc.so when no config file and no env vars", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://api.asc.so");
    warnSpy.mockRestore();
  });

  it("reads consumer and provider from TOML config file", () => {
    const toml = `
[environment]
active = "sandbox"

[sandbox]
base_url = "https://api.preview.asc.so"

[sandbox.consumer]
api_key = "asc_test_cons"
id = "con_123"

[sandbox.provider]
api_key = "asc_test_prov"
id = "prv_456"
`;
    mockReadFileSync.mockReturnValue(toml);
    const config = loadConfig();

    expect(config.baseUrl).toBe("https://api.preview.asc.so");
    expect(config.consumer).toEqual({ apiKey: "asc_test_cons", consumerId: "con_123" });
    expect(config.provider).toEqual({ apiKey: "asc_test_prov", providerId: "prv_456" });
  });

  it("env vars override TOML values", () => {
    const toml = `
[environment]
active = "sandbox"

[sandbox]
base_url = "https://api.preview.asc.so"

[sandbox.consumer]
api_key = "asc_test_cons"
id = "con_123"
`;
    mockReadFileSync.mockReturnValue(toml);

    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_CONSUMER_API_KEY"] = "asc_override_key";
    process.env["ASC_CONSUMER_ID"] = "con_override";
    process.env["ASC_PROVIDER_API_KEY"] = "asc_prov_key";
    process.env["ASC_PROVIDER_ID"] = "prv_env";

    const config = loadConfig();
    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.consumer).toEqual({ apiKey: "asc_override_key", consumerId: "con_override" });
    expect(config.provider).toEqual({ apiKey: "asc_prov_key", providerId: "prv_env" });
  });

  it("handles invalid TOML without crashing", () => {
    mockReadFileSync.mockReturnValue("this is { not valid toml");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://api.asc.so");
    expect(config.consumer).toBeNull();
    expect(config.provider).toBeNull();
    warnSpy.mockRestore();
  });

  it("returns consumer config when consumer env vars are set", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_CONSUMER_API_KEY"] = "asc_cons_key";
    process.env["ASC_CONSUMER_ID"] = "cons_123";

    const config = loadConfig();
    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.consumer).toEqual({ apiKey: "asc_cons_key", consumerId: "cons_123" });
    expect(config.provider).toBeNull();
  });

  it("uses production environment when active is production", () => {
    const toml = `
[environment]
active = "production"

[production]
base_url = "https://api.asc.so"

[production.consumer]
api_key = "asc_live_cons"
id = "con_prod"
`;
    mockReadFileSync.mockReturnValue(toml);
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://api.asc.so");
    expect(config.consumer).toEqual({ apiKey: "asc_live_cons", consumerId: "con_prod" });
  });

  it("warns when no credentials are configured", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadConfig();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No credentials configured"));
    warnSpy.mockRestore();
  });
});

describe("getConfigStatus", () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    delete process.env["ASC_CONSUMER_API_KEY"];
    delete process.env["ASC_CONSUMER_ID"];
    delete process.env["ASC_PROVIDER_API_KEY"];
    delete process.env["ASC_PROVIDER_ID"];
  });

  it("returns not configured when no file and no env vars", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const status = getConfigStatus();
    expect(status.configFileExists).toBe(false);
    expect(status.hasConsumer).toBe(false);
    expect(status.hasProvider).toBe(false);
    expect(status.isFullyConfigured).toBe(false);
    expect(status.activeEnvironment).toBeNull();
  });

  it("detects consumer from env vars even without config file", () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    process.env["ASC_CONSUMER_API_KEY"] = "asc_key";
    process.env["ASC_CONSUMER_ID"] = "con_123";

    const status = getConfigStatus();
    expect(status.hasConsumer).toBe(true);
    expect(status.hasProvider).toBe(false);
    expect(status.isFullyConfigured).toBe(false);
  });

  it("detects fully configured from TOML file", () => {
    const toml = `
[environment]
active = "sandbox"

[sandbox]
base_url = "https://api.preview.asc.so"

[sandbox.consumer]
api_key = "asc_test_cons"
id = "con_123"

[sandbox.provider]
api_key = "asc_test_prov"
id = "prv_456"
`;
    mockReadFileSync.mockReturnValue(toml);
    const status = getConfigStatus();
    expect(status.configFileExists).toBe(true);
    expect(status.activeEnvironment).toBe("sandbox");
    expect(status.hasConsumer).toBe(true);
    expect(status.hasProvider).toBe(true);
    expect(status.isFullyConfigured).toBe(true);
  });
});
