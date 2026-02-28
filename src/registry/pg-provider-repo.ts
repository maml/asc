import type pg from "pg";
import type { ProviderId } from "../types/brand.js";
import type { PaginationRequest } from "../types/common.js";
import type { ProviderOrg } from "../types/provider.js";
import type {
  ProviderRepository,
  CreateProviderInput,
  UpdateProviderInput,
  Paginated,
} from "./repository.js";

function rowToProvider(row: Record<string, unknown>): ProviderOrg {
  return {
    id: row["id"] as ProviderId,
    name: row["name"] as string,
    description: row["description"] as string,
    contactEmail: row["contact_email"] as string,
    webhookUrl: row["webhook_url"] as string,
    status: row["status"] as ProviderOrg["status"],
    apiKeyHash: row["api_key_hash"] as string,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
    createdAt: (row["created_at"] as Date).toISOString(),
    updatedAt: (row["updated_at"] as Date).toISOString(),
  };
}

export class PgProviderRepository implements ProviderRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: CreateProviderInput): Promise<ProviderOrg> {
    const { rows } = await this.pool.query(
      `INSERT INTO providers (name, description, contact_email, webhook_url, api_key_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.name, input.description, input.contactEmail, input.webhookUrl, input.apiKeyHash, JSON.stringify(input.metadata)]
    );
    return rowToProvider(rows[0] as Record<string, unknown>);
  }

  async findById(id: ProviderId): Promise<ProviderOrg | null> {
    const { rows } = await this.pool.query("SELECT * FROM providers WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToProvider(rows[0] as Record<string, unknown>);
  }

  async list(pagination: PaginationRequest, status?: string): Promise<Paginated<ProviderOrg>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (pagination.cursor) {
      conditions.push(`id > $${idx++}`);
      params.push(pagination.cursor);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    // Fetch one extra to determine hasMore
    params.push(pagination.limit + 1);

    const { rows } = await this.pool.query(
      `SELECT * FROM providers ${where} ORDER BY id ASC LIMIT $${idx}`,
      params
    );

    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(
      (r) => rowToProvider(r as Record<string, unknown>)
    );
    const lastItem = items[items.length - 1];

    return {
      items,
      pagination: {
        hasMore,
        nextCursor: hasMore && lastItem ? lastItem.id : undefined,
      },
    };
  }

  async update(id: ProviderId, input: UpdateProviderInput): Promise<ProviderOrg> {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); params.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); params.push(input.description); }
    if (input.contactEmail !== undefined) { sets.push(`contact_email = $${idx++}`); params.push(input.contactEmail); }
    if (input.webhookUrl !== undefined) { sets.push(`webhook_url = $${idx++}`); params.push(input.webhookUrl); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); params.push(input.status); }
    if (input.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(input.metadata)); }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE providers SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) throw new Error(`Provider ${id} not found`);
    return rowToProvider(rows[0] as Record<string, unknown>);
  }

  async delete(id: ProviderId): Promise<void> {
    await this.pool.query("DELETE FROM providers WHERE id = $1", [id]);
  }
}
