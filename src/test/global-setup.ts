// Global setup: runs once before all test files.
// Creates the asc_test database and applies all migrations.

import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_CONFIG = {
  host: "localhost",
  port: 5433,
  user: "asc",
  password: "asc_dev_password",
  database: "postgres",
};

const TEST_DB = "asc_test";

const MIGRATION_FILES = [
  "001_initial_schema.sql",
  "002_coordination.sql",
  "003_observability.sql",
  "004_billing.sql",
  "005_auth_indexes.sql",
  "006_pipelines.sql",
  "007_crypto_keys.sql",
  "008_settlements.sql",
];

export async function setup(): Promise<void> {
  const client = new pg.Client(ADMIN_CONFIG);
  await client.connect();

  // Terminate existing connections to the test database
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB]
  );

  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();

  // Apply migrations to the test database
  const testClient = new pg.Client({
    ...ADMIN_CONFIG,
    database: TEST_DB,
  });
  await testClient.connect();

  const migrationsDir = join(process.cwd(), "migrations");
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    await testClient.query(sql);
  }

  await testClient.end();
}

export async function teardown(): Promise<void> {
  const client = new pg.Client(ADMIN_CONFIG);
  await client.connect();

  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB]
  );
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.end();
}
