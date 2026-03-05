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
    const databaseUrl = process.env["DATABASE_URL"];

    if (databaseUrl) {
      // Neon / production: use connection string with SSL
      const useSSL =
        databaseUrl.includes("sslmode=require") ||
        process.env["NODE_ENV"] === "production";
      pool = new pg.Pool({
        connectionString: databaseUrl,
        ssl: useSSL ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30_000,
      });
    } else {
      // Local dev: use individual fields
      pool = new pg.Pool({
        ...config,
        max: 20,
        idleTimeoutMillis: 30_000,
      });
    }
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
