import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";

// Mock fs operations
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock config.ts to control the config file path
vi.mock("../config.js", () => ({
  getConfigFilePath: vi.fn(() => "/tmp/test-asc/config.toml"),
}));

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { writeConfig } from "../config-writer.js";

const mockRead = readFileSync as ReturnType<typeof vi.fn>;
const mockWrite = writeFileSync as ReturnType<typeof vi.fn>;
const mockMkdir = mkdirSync as ReturnType<typeof vi.fn>;

describe("writeConfig", () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockWrite.mockReset();
    mockMkdir.mockReset();
  });

  it("writes new config when no existing file", () => {
    mockRead.mockImplementation(() => { throw new Error("ENOENT"); });

    const result = writeConfig({
      environment: "sandbox",
      baseUrl: "https://api.preview.asc.so",
      consumer: { apiKey: "asc_test_key", id: "con_123" },
    });

    expect(result).toEqual({ path: "/tmp/test-asc/config.toml" });
    expect(mockMkdir).toHaveBeenCalledWith("/tmp/test-asc", { recursive: true });
    expect(mockWrite).toHaveBeenCalledWith(
      "/tmp/test-asc/config.toml",
      expect.stringContaining("asc_test_key"),
      { mode: 0o600 }
    );
  });

  it("merges into existing config preserving other environments", () => {
    const existing = `
[environment]
active = "sandbox"

[sandbox]
base_url = "https://api.preview.asc.so"

[sandbox.consumer]
api_key = "old_key"
id = "con_old"

[production]
base_url = "https://api.asc.so"

[production.consumer]
api_key = "asc_live_key"
id = "con_prod"
`;
    mockRead.mockReturnValue(existing);

    const result = writeConfig({
      environment: "sandbox",
      baseUrl: "https://api.preview.asc.so",
      consumer: { apiKey: "asc_test_new", id: "con_new" },
      provider: { apiKey: "asc_test_prov", id: "prv_new" },
    });

    expect(result).toEqual({ path: "/tmp/test-asc/config.toml" });

    // Check that production section is preserved in the written content
    const written = mockWrite.mock.calls[0]![1] as string;
    expect(written).toContain("asc_live_key");
    expect(written).toContain("con_prod");
    // Check new sandbox values
    expect(written).toContain("asc_test_new");
    expect(written).toContain("con_new");
    expect(written).toContain("asc_test_prov");
    expect(written).toContain("prv_new");
  });

  it("sets file permissions to 0o600", () => {
    mockRead.mockImplementation(() => { throw new Error("ENOENT"); });

    writeConfig({
      environment: "sandbox",
      baseUrl: "https://api.preview.asc.so",
      consumer: { apiKey: "key", id: "id" },
    });

    expect(mockWrite).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { mode: 0o600 }
    );
  });

  it("creates directory if needed", () => {
    mockRead.mockImplementation(() => { throw new Error("ENOENT"); });

    writeConfig({
      environment: "production",
      baseUrl: "https://api.asc.so",
      consumer: { apiKey: "key", id: "id" },
    });

    expect(mockMkdir).toHaveBeenCalledWith("/tmp/test-asc", { recursive: true });
  });

  it("returns error without throwing on write failure", () => {
    mockRead.mockImplementation(() => { throw new Error("ENOENT"); });
    mockWrite.mockImplementation(() => { throw new Error("EACCES: permission denied"); });

    const result = writeConfig({
      environment: "sandbox",
      baseUrl: "https://api.preview.asc.so",
      consumer: { apiKey: "key", id: "id" },
    });

    expect(result).toEqual({ error: expect.stringContaining("permission denied") });
  });

  it("writes both consumer and provider when both provided", () => {
    mockRead.mockImplementation(() => { throw new Error("ENOENT"); });

    writeConfig({
      environment: "self_hosted",
      baseUrl: "http://localhost:3100",
      consumer: { apiKey: "cons_key", id: "con_1" },
      provider: { apiKey: "prov_key", id: "prv_1" },
    });

    const written = mockWrite.mock.calls[0]![1] as string;
    expect(written).toContain("cons_key");
    expect(written).toContain("con_1");
    expect(written).toContain("prov_key");
    expect(written).toContain("prv_1");
    expect(written).toContain("localhost:3100");
  });
});
