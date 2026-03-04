// Per-file setup: provides a test pool and truncation helper.
// Tests NEVER import getPool() from src/db/pool.ts — that singleton
// caches the first config and would connect to the wrong database.

import pg from "pg";
import { afterAll } from "vitest";

let testPool: pg.Pool | null = null;

export function getTestPool(): pg.Pool {
  if (!testPool) {
    testPool = new pg.Pool({
      host: "localhost",
      port: 5433,
      user: "asc",
      password: "asc_dev_password",
      database: "asc_test",
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return testPool;
}

// FK-safe truncation in dependency order (children before parents)
const TABLES_IN_TRUNCATION_ORDER = [
  "crypto_keys",
  "pipeline_events",
  "pipeline_step_executions",
  "pipeline_executions",
  "pipelines",
  "quality_check_records",
  "quality_gates",
  "sla_compliance_records",
  "sla_rules",
  "spans",
  "traces",
  "billing_events",
  "invoices",
  "coordination_events",
  "tasks",
  "coordinations",
  "agents",
  "consumers",
  "providers",
];

export async function truncateAll(pool?: pg.Pool): Promise<void> {
  const p = pool ?? getTestPool();
  await p.query(
    `TRUNCATE ${TABLES_IN_TRUNCATION_ORDER.join(", ")} CASCADE`
  );
}

afterAll(async () => {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
});
