import pg from "pg";

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

const defaultConfig: DbConfig = {
  host: process.env["DB_HOST"] ?? "localhost",
  port: parseInt(process.env["DB_PORT"] ?? "5433", 10),
  database: process.env["DB_NAME"] ?? "asc",
  user: process.env["DB_USER"] ?? "asc",
  password: process.env["DB_PASSWORD"] ?? "asc_dev_password",
};

let pool: pg.Pool | null = null;

export function getPool(config: DbConfig = defaultConfig): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
