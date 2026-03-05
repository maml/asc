import { describe, it, expect, afterEach, vi } from "vitest";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  afterEach(() => {
    delete process.env["ASC_BASE_URL"];
    delete process.env["ASC_CONSUMER_API_KEY"];
    delete process.env["ASC_CONSUMER_ID"];
    delete process.env["ASC_PROVIDER_API_KEY"];
    delete process.env["ASC_PROVIDER_ID"];
    vi.restoreAllMocks();
  });

  it("defaults baseUrl to api.asc.so when ASC_BASE_URL is not set", () => {
    const config = loadConfig();
    expect(config.baseUrl).toBe("https://api.asc.so");
  });

  it("returns consumer config when consumer env vars are set", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_CONSUMER_API_KEY"] = "asc_cons_key";
    process.env["ASC_CONSUMER_ID"] = "cons_123";

    const config = loadConfig();

    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.consumer).toEqual({
      apiKey: "asc_cons_key",
      consumerId: "cons_123",
    });
    expect(config.provider).toBeNull();
  });

  it("returns provider config when provider env vars are set", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_PROVIDER_API_KEY"] = "asc_prov_key";
    process.env["ASC_PROVIDER_ID"] = "prov_456";

    const config = loadConfig();

    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.provider).toEqual({
      apiKey: "asc_prov_key",
      providerId: "prov_456",
    });
    expect(config.consumer).toBeNull();
  });

  it("returns both when both consumer and provider env vars are set", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_CONSUMER_API_KEY"] = "asc_cons_key";
    process.env["ASC_CONSUMER_ID"] = "cons_123";
    process.env["ASC_PROVIDER_API_KEY"] = "asc_prov_key";
    process.env["ASC_PROVIDER_ID"] = "prov_456";

    const config = loadConfig();

    expect(config.consumer).toEqual({
      apiKey: "asc_cons_key",
      consumerId: "cons_123",
    });
    expect(config.provider).toEqual({
      apiKey: "asc_prov_key",
      providerId: "prov_456",
    });
  });

  it("consumer is null when only API key is set without ID", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_CONSUMER_API_KEY"] = "asc_cons_key";
    // ASC_CONSUMER_ID intentionally not set

    const config = loadConfig();

    expect(config.consumer).toBeNull();
  });

  it("provider is null when only API key is set without ID", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    process.env["ASC_PROVIDER_API_KEY"] = "asc_prov_key";
    // ASC_PROVIDER_ID intentionally not set

    const config = loadConfig();

    expect(config.provider).toBeNull();
  });

  it("warns when no credentials are configured", () => {
    process.env["ASC_BASE_URL"] = "http://localhost:3100";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    loadConfig();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No credentials configured")
    );
  });
});
