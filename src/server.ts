import { getPool, closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);

async function main(): Promise<void> {
  await runMigrations();
  const pool = getPool();
  const { app, pipelineService, coordService } = await buildApp(pool);

  const shutdown = async () => {
    await pipelineService.drain();
    await coordService.drain();
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Sandbox webhook: echoes input as output for demo agents (preview env only)
  if (process.env["NODE_ENV"] === "preview") {
    app.post("/sandbox-webhook", async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      return reply.send({
        status: "success",
        output: body,
        message: "Sandbox echo response",
      });
    });
  }

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`ASC server running on port ${PORT} [${process.env["NODE_ENV"] ?? "development"}]`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
