// Resolves an agent's provider webhook URL by joining agents → providers

import type pg from "pg";
import type { AgentId } from "../types/brand.js";

export class PgProviderLookup {
  constructor(private pool: pg.Pool) {}

  async getWebhookUrl(agentId: AgentId): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT p.webhook_url FROM agents a
       JOIN providers p ON a.provider_id = p.id
       WHERE a.id = $1 AND a.status = 'active' AND p.status = 'active'`,
      [agentId]
    );
    if (rows.length === 0) return null;
    return (rows[0] as Record<string, unknown>)["webhook_url"] as string;
  }
}
