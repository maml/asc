import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseTOML } from "smol-toml";

export interface Config {
  baseUrl: string;
  consumer: { apiKey: string; consumerId: string } | null;
  provider: { apiKey: string; providerId: string } | null;
}

export interface ConfigStatus {
  configFileExists: boolean;
  configFilePath: string;
  activeEnvironment: string | null;
  hasConsumer: boolean;
  hasProvider: boolean;
  isFullyConfigured: boolean;
}

type TomlValue = string | number | boolean | TomlTable | TomlValue[];
interface TomlTable { [key: string]: TomlValue | undefined }

/** Resolve config file path, respecting XDG_CONFIG_HOME */
export function getConfigFilePath(): string {
  const configHome = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(configHome, "asc", "config.toml");
}

/** Read and parse the TOML config file, returning null on any failure */
function readConfigFile(): TomlTable | null {
  try {
    const raw = readFileSync(getConfigFilePath(), "utf-8");
    return parseTOML(raw) as TomlTable;
  } catch {
    return null;
  }
}

/** Extract credentials from a TOML environment section */
function extractFromToml(toml: TomlTable): Partial<Config> {
  const envSection = toml["environment"] as TomlTable | undefined;
  const active = (envSection?.["active"] as string) ?? "sandbox";
  const section = toml[active] as TomlTable | undefined;
  if (!section) return {};

  const baseUrl = section["base_url"] as string | undefined;
  const consumerSection = section["consumer"] as TomlTable | undefined;
  const providerSection = section["provider"] as TomlTable | undefined;

  const consumer =
    consumerSection?.["api_key"] && consumerSection?.["id"]
      ? { apiKey: consumerSection["api_key"] as string, consumerId: consumerSection["id"] as string }
      : null;

  const provider =
    providerSection?.["api_key"] && providerSection?.["id"]
      ? { apiKey: providerSection["api_key"] as string, providerId: providerSection["id"] as string }
      : null;

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(consumer ? { consumer } : {}),
    ...(provider ? { provider } : {}),
  };
}

export function loadConfig(): Config {
  // Start with TOML file values
  const toml = readConfigFile();
  const fromFile = toml ? extractFromToml(toml) : {};

  // Env vars override everything
  const baseUrl = process.env["ASC_BASE_URL"] ?? fromFile.baseUrl ?? "https://api.asc.so";

  const consumerKey = process.env["ASC_CONSUMER_API_KEY"];
  const consumerId = process.env["ASC_CONSUMER_ID"];
  const providerKey = process.env["ASC_PROVIDER_API_KEY"];
  const providerId = process.env["ASC_PROVIDER_ID"];

  const consumer =
    consumerKey && consumerId
      ? { apiKey: consumerKey, consumerId }
      : fromFile.consumer ?? null;

  const provider =
    providerKey && providerId
      ? { apiKey: providerKey, providerId }
      : fromFile.provider ?? null;

  if (!consumer && !provider) {
    console.warn(
      "Warning: No credentials configured. Set ASC_CONSUMER_API_KEY + ASC_CONSUMER_ID and/or ASC_PROVIDER_API_KEY + ASC_PROVIDER_ID, or run asc_onboard to get started."
    );
  }

  return { baseUrl, consumer, provider };
}

export function getConfigStatus(): ConfigStatus {
  const configFilePath = getConfigFilePath();
  const toml = readConfigFile();
  const configFileExists = toml !== null;

  let activeEnvironment: string | null = null;
  let hasConsumer = false;
  let hasProvider = false;

  if (toml) {
    const envSection = toml["environment"] as TomlTable | undefined;
    activeEnvironment = (envSection?.["active"] as string) ?? "sandbox";
    const section = toml[activeEnvironment] as TomlTable | undefined;
    if (section) {
      const cs = section["consumer"] as TomlTable | undefined;
      const ps = section["provider"] as TomlTable | undefined;
      hasConsumer = !!(cs?.["api_key"] && cs?.["id"]);
      hasProvider = !!(ps?.["api_key"] && ps?.["id"]);
    }
  }

  // Also check env vars
  if (process.env["ASC_CONSUMER_API_KEY"] && process.env["ASC_CONSUMER_ID"]) hasConsumer = true;
  if (process.env["ASC_PROVIDER_API_KEY"] && process.env["ASC_PROVIDER_ID"]) hasProvider = true;

  return {
    configFileExists,
    configFilePath,
    activeEnvironment,
    hasConsumer,
    hasProvider,
    isFullyConfigured: hasConsumer && hasProvider,
  };
}
