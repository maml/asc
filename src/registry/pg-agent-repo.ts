import type pg from "pg";
import type { AgentId, ProviderId } from "../types/brand.js";
import type { PaginationRequest } from "../types/common.js";
import type { Agent } from "../types/agent.js";
import type {
  AgentRepository,
  CreateAgentInput,
  UpdateAgentInput,
  ListAgentsFilter,
  Paginated,
} from "./repository.js";

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row["id"] as AgentId,
    providerId: row["provider_id"] as ProviderId,
    name: row["name"] as string,
    description: row["description"] as string,
    version: row["version"] as string,
    status: row["status"] as Agent["status"],
    capabilities: row["capabilities"] as Agent["capabilities"],
    pricing: row["pricing"] as Agent["pricing"],
    sla: row["sla"] as Agent["sla"],
    supportsStreaming: row["supports_streaming"] as boolean,
    metadata: (row["metadata"] ?? {}) as Record<string, string>,
    createdAt: (row["created_at"] as Date).toISOString(),
    updatedAt: (row["updated_at"] as Date).toISOString(),
  };
}

export class PgAgentRepository implements AgentRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: CreateAgentInput): Promise<Agent> {
    const { rows } = await this.pool.query(
      `INSERT INTO agents (provider_id, name, description, version, capabilities, pricing, sla, supports_streaming, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.providerId, input.name, input.description, input.version,
        JSON.stringify(input.capabilities), JSON.stringify(input.pricing),
        JSON.stringify(input.sla), input.supportsStreaming, JSON.stringify(input.metadata),
      ]
    );
    return rowToAgent(rows[0] as Record<string, unknown>);
  }

  async findById(id: AgentId): Promise<Agent | null> {
    const { rows } = await this.pool.query("SELECT * FROM agents WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    return rowToAgent(rows[0] as Record<string, unknown>);
  }

  async list(pagination: PaginationRequest, filter?: ListAgentsFilter): Promise<Paginated<Agent>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.providerId) {
      conditions.push(`provider_id = $${idx++}`);
      params.push(filter.providerId);
    }
    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filter.status);
    }
    if (filter?.capability) {
      // Search inside the JSONB capabilities array for a matching name
      conditions.push(`capabilities @> $${idx++}::jsonb`);
      params.push(JSON.stringify([{ name: filter.capability }]));
    }
    if (filter?.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${filter.search}%`);
      idx++;
    }
    if (filter?.pricingType) {
      conditions.push(`pricing->>'type' = $${idx++}`);
      params.push(filter.pricingType);
    }
    if (pagination.cursor) {
      conditions.push(`id > $${idx++}`);
      params.push(pagination.cursor);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(pagination.limit + 1);

    // Dynamic sort
    const sortField = filter?.sort ?? "id";
    const sortDir = filter?.sortDir === "desc" ? "DESC" : "ASC";
    let orderCol: string;
    switch (sortField) {
      case "name": orderCol = "name"; break;
      case "created_at": orderCol = "created_at"; break;
      case "price": orderCol = "(pricing->>'pricePerCall')::text"; break;
      default: orderCol = "id";
    }

    const { rows } = await this.pool.query(
      `SELECT * FROM agents ${where} ORDER BY ${orderCol} ${sortDir}, id ASC LIMIT $${idx}`,
      params
    );

    const hasMore = rows.length > pagination.limit;
    const items = (hasMore ? rows.slice(0, pagination.limit) : rows).map(
      (r) => rowToAgent(r as Record<string, unknown>)
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

  async update(id: AgentId, input: UpdateAgentInput): Promise<Agent> {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); params.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); params.push(input.description); }
    if (input.version !== undefined) { sets.push(`version = $${idx++}`); params.push(input.version); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); params.push(input.status); }
    if (input.capabilities !== undefined) { sets.push(`capabilities = $${idx++}`); params.push(JSON.stringify(input.capabilities)); }
    if (input.pricing !== undefined) { sets.push(`pricing = $${idx++}`); params.push(JSON.stringify(input.pricing)); }
    if (input.sla !== undefined) { sets.push(`sla = $${idx++}`); params.push(JSON.stringify(input.sla)); }
    if (input.supportsStreaming !== undefined) { sets.push(`supports_streaming = $${idx++}`); params.push(input.supportsStreaming); }
    if (input.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(input.metadata)); }

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE agents SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) throw new Error(`Agent ${id} not found`);
    return rowToAgent(rows[0] as Record<string, unknown>);
  }

  async delete(id: AgentId): Promise<void> {
    await this.pool.query("DELETE FROM agents WHERE id = $1", [id]);
  }
}
