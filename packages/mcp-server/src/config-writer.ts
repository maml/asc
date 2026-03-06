import { readFileSync, writeFileSync, mkdirSync, constants } from "node:fs";
import { dirname } from "node:path";
import { parse as parseTOML, stringify as stringifyTOML } from "smol-toml";
import { getConfigFilePath } from "./config.js";

export interface WriteConfigParams {
  environment: "sandbox" | "production" | "self_hosted";
  baseUrl: string;
  consumer?: { apiKey: string; id: string };
  provider?: { apiKey: string; id: string };
}

export function writeConfig(params: WriteConfigParams): { path: string } | { error: string } {
  const filePath = getConfigFilePath();

  try {
    // Read existing config to merge (don't overwrite other environments)
    let existing: Record<string, unknown> = {};
    try {
      const raw = readFileSync(filePath, "utf-8");
      existing = parseTOML(raw) as Record<string, unknown>;
    } catch {
      // No existing file — start fresh
    }

    // Set active environment
    existing["environment"] = { active: params.environment };

    // Build environment section, preserving any existing keys
    const envKey = params.environment;
    const section = (existing[envKey] as Record<string, unknown>) ?? {};
    section["base_url"] = params.baseUrl;

    if (params.consumer) {
      section["consumer"] = {
        api_key: params.consumer.apiKey,
        id: params.consumer.id,
      };
    }

    if (params.provider) {
      section["provider"] = {
        api_key: params.provider.apiKey,
        id: params.provider.id,
      };
    }

    existing[envKey] = section;

    // Ensure directory exists
    mkdirSync(dirname(filePath), { recursive: true });

    // Write with owner-only permissions (API keys in file)
    writeFileSync(filePath, stringifyTOML(existing), { mode: 0o600 });

    return { path: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to write config: ${message}` };
  }
}
