import type pg from "pg";
import type { ConsumerId } from "../types/brand.js";
import type { PaginationRequest } from "../types/common.js";
import type { ConsumerOrg } from "../types/consumer.js";
import type {
  ConsumerRepository,
  CreateConsumerInput,
  UpdateConsumerInput,
  Paginated,
} from "./repository.js";

function rowToConsumer(row: Record<string, unknown>): ConsumerOrg {
  return {
    id: row["id"] as ConsumerId,
    name: row["name"] as string,
    description: row["description"] as string,
    contactEmail: row["contact_email"] as string,
    status: row["status"] as ConsumerOrg["status"],
    apiKeyHash: row["api_key_hash"] as string,
    rateLimitPerMinute: row["rate_limit_per_minute"] as number,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
    createdAt: (row["created_at"] as Date).toISOString(),
    updatedAt: (row["updated_at"] as Date).toISOString(),
  };
}

export class PgConsumerRepository implements ConsumerRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: CreateConsumerInput): Promise<ConsumerOrg> {
    const { rows } = await this.pool.query(
      `INSERT INTO consumers (name, description, contact_email, api_key_hash, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.name, input.description, input.contactEmail, input.apiKeyHash, JSON.stringify(input.metadata)]
    );
    return rowToConsumer(rows[0] as Record<string, unknown>);
  }

  async findById(id: ConsumerId): Promise<ConsumerOrg | null> {
    const { rows } = await this.pool.query("SELECT * FROM consumers WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToConsumer(rows[0] as Record<string, unknown>);
  }

  async list(pagination: PaginationRequest, status?: string): Promise<Paginated<ConsumerOrg>> {
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
    params.push(pagination.limit + 1);

    const { rows } = await this.pool.query(
      `SELECT * FROM consumers ${where} ORDER BY id ASC LIMIT $${idx}`,
      params
    );

    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(
      (r) => rowToConsumer(r as Record<string, unknown>)
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

  async update(id: ConsumerId, input: UpdateConsumerInput): Promise<ConsumerOrg> {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); params.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); params.push(input.description); }
    if (input.contactEmail !== undefined) { sets.push(`contact_email = $${idx++}`); params.push(input.contactEmail); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); params.push(input.status); }
    if (input.rateLimitPerMinute !== undefined) { sets.push(`rate_limit_per_minute = $${idx++}`); params.push(input.rateLimitPerMinute); }
    if (input.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(input.metadata)); }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE consumers SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) throw new Error(`Consumer ${id} not found`);
    return rowToConsumer(rows[0] as Record<string, unknown>);
  }

  async delete(id: ConsumerId): Promise<void> {
    await this.pool.query("DELETE FROM consumers WHERE id = $1", [id]);
  }
}
