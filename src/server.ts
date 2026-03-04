import { getPool, closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { buildApp } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);

async function main(): Promise<void> {
  await runMigrations();
  const pool = getPool();
  const { app } = await buildApp(pool);

  const shutdown = async () => {
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`ASC server running on port ${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
