import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerProvider, registerConsumer } from "@asc-so/client";
import type { Clients } from "../clients.js";
import { getConfigStatus } from "../config.js";
import { writeConfig } from "../config-writer.js";
import { formatResult, formatError } from "../util/errors.js";

const ENV_BASE_URLS: Record<string, string> = {
  sandbox: "https://preview-api.asc.so",
  production: "https://api.asc.so",
};

export function register(server: McpServer, clients: Clients): void {
  // --- MCP Prompt: get_started ---
  server.prompt(
    "asc_get_started",
    "Interactive onboarding guide for ASC — detects your config and provides next steps",
    () => {
      const status = getConfigStatus();

      let text: string;
      if (!status.configFileExists && !status.hasConsumer && !status.hasProvider) {
        text = [
          "Welcome to ASC — the coordination layer for AI agents!",
          "",
          "You're not configured yet. Get started in 60 seconds:",
          "",
          '1. Run the `asc_onboard` tool with environment="sandbox" and role="both"',
          "2. This will register you as a consumer and provider on the sandbox",
          "3. Your credentials will be saved to " + status.configFilePath,
          "",
          "After onboarding, try:",
          "- `asc_registry_list_agents` — browse available agents",
          "- `asc_sandbox_explore` — see pre-built demo agents and pipelines",
          "- `asc_coordination_create` — run your first coordination",
        ].join("\n");
      } else if (status.hasConsumer && status.hasProvider) {
        text = [
          `ASC is fully configured (environment: ${status.activeEnvironment ?? "env vars"}).`,
          "",
          "Quick reference:",
          "- `asc_registry_list_agents` — browse the agent marketplace",
          "- `asc_coordination_create` — coordinate work between agents",
          "- `asc_pipeline_list` — view multi-agent pipelines",
          "- `asc_billing_summary` — check usage and costs",
          "- `asc_observability_list_traces` — debug coordination flows",
        ].join("\n");
      } else {
        const missing = !status.hasConsumer ? "consumer" : "provider";
        text = [
          `ASC config found but incomplete — missing ${missing} credentials.`,
          "",
          `Run \`asc_onboard\` with role="${missing}" to complete setup.`,
          "",
          "Current config: " + status.configFilePath,
        ].join("\n");
      }

      return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
    }
  );

  // --- Tool: asc_onboard ---
  server.tool(
    "asc_onboard",
    "Register with ASC and save credentials. Sets up consumer and/or provider accounts in one step.",
    {
      environment: z.enum(["sandbox", "production", "self_hosted"]).describe("Target environment"),
      role: z.enum(["consumer", "provider", "both"]).describe("Register as consumer, provider, or both"),
      name: z.string().describe("Organization name"),
      contactEmail: z.string().email().describe("Contact email"),
      description: z.string().optional().describe("Organization description"),
      webhookUrl: z.string().url().optional().describe("Webhook URL (required for provider role)"),
      baseUrl: z.string().url().optional().describe("Base URL (required for self_hosted environment)"),
    },
    async (params) => {
      try {
        const needsProvider = params.role === "provider" || params.role === "both";
        const needsConsumer = params.role === "consumer" || params.role === "both";

        // Validate requirements
        if (needsProvider && !params.webhookUrl) {
          return formatError(new Error("webhookUrl is required when role includes provider"));
        }
        if (params.environment === "self_hosted" && !params.baseUrl) {
          return formatError(new Error("baseUrl is required for self_hosted environment"));
        }

        const baseUrl = params.baseUrl ?? ENV_BASE_URLS[params.environment] ?? "https://api.asc.so";

        let consumerResult: { consumer: { id: string }; apiKey: string } | null = null;
        let providerResult: { provider: { id: string }; apiKey: string } | null = null;

        // Register consumer
        if (needsConsumer) {
          consumerResult = await registerConsumer(baseUrl, {
            name: params.name,
            description: params.description ?? `${params.name} consumer`,
            contactEmail: params.contactEmail,
          }) as { consumer: { id: string }; apiKey: string };
        }

        // Register provider
        if (needsProvider) {
          providerResult = await registerProvider(baseUrl, {
            name: params.name,
            description: params.description ?? `${params.name} provider`,
            contactEmail: params.contactEmail,
            webhookUrl: params.webhookUrl!,
          }) as { provider: { id: string }; apiKey: string };
        }

        // Persist credentials
        const writeResult = writeConfig({
          environment: params.environment,
          baseUrl,
          consumer: consumerResult
            ? { apiKey: consumerResult.apiKey, id: consumerResult.consumer.id }
            : undefined,
          provider: providerResult
            ? { apiKey: providerResult.apiKey, id: providerResult.provider.id }
            : undefined,
        });

        const configWarning = "error" in writeResult
          ? `\n\nWarning: Could not save config — ${writeResult.error}\nSave these credentials manually!`
          : "";

        const lines: string[] = [
          "Registration successful!",
          "",
          `Environment: ${params.environment}`,
          `Base URL: ${baseUrl}`,
        ];

        if (consumerResult) {
          lines.push("", "Consumer:", `  ID: ${consumerResult.consumer.id}`, `  API Key: ${consumerResult.apiKey}`);
        }
        if (providerResult) {
          lines.push("", "Provider:", `  ID: ${providerResult.provider.id}`, `  API Key: ${providerResult.apiKey}`);
        }

        if ("path" in writeResult) {
          lines.push("", `Config saved to: ${writeResult.path}`);
        }

        lines.push(
          configWarning,
          "",
          "Next steps:",
          "- `asc_registry_list_agents` — browse available agents",
          "- `asc_sandbox_explore` — see demo agents and pipelines",
          "- `asc_coordination_create` — run your first coordination",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Tool: asc_sandbox_status ---
  server.tool(
    "asc_sandbox_status",
    "Check your ASC configuration status and sandbox connectivity",
    {},
    async () => {
      try {
        const status = getConfigStatus();
        const result: Record<string, unknown> = {
          configFileExists: status.configFileExists,
          configFilePath: status.configFilePath,
          activeEnvironment: status.activeEnvironment,
          hasConsumer: status.hasConsumer,
          hasProvider: status.hasProvider,
          isFullyConfigured: status.isFullyConfigured,
        };

        // If configured, try to get agent count
        if (status.hasConsumer || status.hasProvider) {
          const client = clients.consumer ?? clients.provider;
          if (client) {
            try {
              const agents = await client.listAgents({ limit: 1 });
              result["agentCount"] = "agents" in agents ? agents.agents.length : 0;
              result["connected"] = true;
            } catch {
              result["connected"] = false;
              result["connectionError"] = "Could not reach ASC server";
            }
          }
        }

        return formatResult(result);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Tool: asc_sandbox_explore ---
  server.tool(
    "asc_sandbox_explore",
    "List pre-built demo agents and example pipelines from the sandbox environment",
    {},
    async () => {
      try {
        const client = clients.consumer ?? clients.provider;
        if (!client) {
          return formatError(new Error("No credentials configured. Run asc_onboard first."));
        }

        const results: Record<string, unknown> = {};

        // List agents
        try {
          const agents = await client.listAgents({ limit: 50 });
          results["agents"] = agents;
        } catch (err) {
          results["agents"] = { error: err instanceof Error ? err.message : String(err) };
        }

        // List pipelines (consumer only)
        if (clients.consumer) {
          try {
            const pipelines = await clients.consumer.listPipelines();
            results["pipelines"] = pipelines;
          } catch (err) {
            results["pipelines"] = { error: err instanceof Error ? err.message : String(err) };
          }
        }

        return formatResult(results);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
