#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildClients } from "./clients.js";
import * as registry from "./tools/registry.js";
import * as coordination from "./tools/coordination.js";
import * as pipeline from "./tools/pipeline.js";
import * as billing from "./tools/billing.js";
import * as observability from "./tools/observability.js";
import * as settlement from "./tools/settlement.js";
import * as onboarding from "./tools/onboarding.js";

const server = new McpServer({
  name: "asc",
  version: "0.1.0",
});

const config = loadConfig();
const clients = buildClients(config);

registry.register(server, clients);
coordination.register(server, clients);
pipeline.register(server, clients);
billing.register(server, clients);
observability.register(server, clients);
settlement.register(server, clients);
onboarding.register(server, clients);

const transport = new StdioServerTransport();
await server.connect(transport);
