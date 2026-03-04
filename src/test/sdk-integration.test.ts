// Integration test — SDK against a real Fastify server with Postgres.
// Same pattern as e2e-smoke.test.ts but exercised through the SDK clients.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { getTestPool, truncateAll } from "./setup.js";
import { buildApp, type AppContext } from "../app.js";
import { clearAuthCache } from "../auth/hook.js";
import { AscProvider, registerProvider } from "../../packages/client/src/provider.js";
import { AscConsumer, registerConsumer } from "../../packages/client/src/consumer.js";
import type { ProviderId, ConsumerId } from "../../packages/client/src/types.js";

// --- Mock provider server (same as e2e-smoke) ---

function createMockProvider(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "POST" && req.url === "/invoke") {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => {
          const body = JSON.parse(data) as Record<string, unknown>;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            taskId: body["taskId"],
            status: "success",
            output: { echo: body["input"], sdk: true },
            durationMs: 20,
          }));
        });
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("SDK Integration", () => {
  const pool = getTestPool();
  let ctx: AppContext;
  let baseUrl: string;
  let mockProviderServer: Server;
  const MOCK_PORT = 19200;

  beforeAll(async () => {
    ctx = await buildApp(pool);
    // Start Fastify on a random port
    const address = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address;
    // Start mock provider
    mockProviderServer = await createMockProvider(MOCK_PORT);
  });

  afterAll(async () => {
    await closeServer(mockProviderServer);
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    clearAuthCache();
  });

  it("full happy path: register → agent → coordinate → waitForCompletion", async () => {
    // 1. Register provider via standalone function
    const { provider, apiKey: providerKey } = await registerProvider(baseUrl, {
      name: "SDK Test Provider",
      description: "Integration test",
      contactEmail: "sdk@test.com",
      webhookUrl: `http://localhost:${MOCK_PORT}`,
    });
    expect(provider.id).toBeTruthy();
    expect(providerKey).toMatch(/^asc_/);

    // 2. Create AscProvider client
    const prov = new AscProvider({
      baseUrl,
      apiKey: providerKey,
      providerId: provider.id as ProviderId,
    });

    // 3. Activate provider
    const updatedProvider = await prov.update({ status: "active" } as never);
    expect(updatedProvider.status).toBe("active");

    // 4. Register + activate agent
    const agent = await prov.registerAgent({
      name: "SDK Echo Agent",
      description: "Echoes input for integration test",
      version: "1.0.0",
      capabilities: [{ name: "echo", description: "Echo", inputSchema: {}, outputSchema: {} }],
      pricing: { type: "per_invocation", pricePerCall: { amountCents: 25, currency: "USD" } },
      sla: { maxLatencyMs: 5000, uptimePercentage: 99.9, maxErrorRate: 0.01 },
      supportsStreaming: false,
    });
    expect(agent.id).toBeTruthy();

    await prov.updateAgent(agent.id, { status: "active" } as never);

    // 5. Verify agent is listed
    const { agents } = await prov.listAgents();
    expect(agents.length).toBe(1);
    expect(agents[0]!.name).toBe("SDK Echo Agent");

    // 6. Register consumer via standalone function
    const { consumer, apiKey: consumerKey } = await registerConsumer(baseUrl, {
      name: "SDK Test Consumer",
      description: "Integration test",
      contactEmail: "consumer@test.com",
    });
    expect(consumer.id).toBeTruthy();

    // 7. Create AscConsumer client
    const cons = new AscConsumer({
      baseUrl,
      apiKey: consumerKey,
      consumerId: consumer.id as ConsumerId,
    });

    // 8. Submit coordination
    const { coordinationId, task } = await cons.submit({
      agentId: agent.id,
      input: { message: "SDK integration test" },
      priority: "normal",
    });
    expect(coordinationId).toBeTruthy();
    expect(task.status).toBe("pending");

    // 9. Wait for completion
    const completed = await cons.waitForCompletion(task.id, { timeoutMs: 10_000, intervalMs: 200 });
    expect(completed.status).toBe("completed");
    expect(completed.output).toEqual({
      echo: { message: "SDK integration test" },
      sdk: true,
    });

    // 10. List events for the coordination
    const { events } = await cons.listEvents(coordinationId);
    const eventTypes = events.map((e) => e.payload.type);
    expect(eventTypes).toContain("task_created");
    expect(eventTypes).toContain("task_completed");

    // 11. Verify billing
    const billingEvents = await cons.listBillingEvents();
    expect(billingEvents.length).toBeGreaterThanOrEqual(1);

    // 12. Verify traces
    const { traces } = await cons.listTraces();
    expect(traces.length).toBeGreaterThanOrEqual(1);

    // 13. Provider can see traces too
    const { traces: provTraces } = await prov.listTraces();
    expect(provTraces.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
