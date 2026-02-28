// Starts all simulated agents on different ports for integration testing.
// Echo on 4100, Slow on 4200, Flaky on 4300.

import { createAgentServer } from "./agent-server.js";
import { handler as echoHandler } from "./echo-agent.js";
import { handler as slowHandler } from "./slow-agent.js";
import { handler as flakyHandler } from "./flaky-agent.js";

const agents = [
  { name: "Echo Agent", port: 4100, handler: echoHandler },
  { name: "Slow Agent", port: 4200, handler: slowHandler },
  { name: "Flaky Agent", port: 4300, handler: flakyHandler },
] as const;

async function main() {
  const servers = await Promise.all(
    agents.map(async ({ name, port, handler }) => {
      const server = await createAgentServer({ port, handler });
      console.log(`  ${name} → http://127.0.0.1:${port}`);
      return server;
    }),
  );

  console.log(`\nAll ${servers.length} simulated agents running. Press Ctrl+C to stop.\n`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down agents...");
    await Promise.all(servers.map((s) => s.close()));
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start agents:", err);
  process.exit(1);
});
