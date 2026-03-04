// Postgres repository for crypto key management.

import type pg from "pg";
import type { CryptoKeyId, ProviderId, ConsumerId } from "../types/brand.js";
import type { RegisteredKey, PublicKeyHex, KeyPathInfo } from "./types.js";

export interface CreateKeyInput {
  entityType: "provider" | "consumer";
  entityId: ProviderId | ConsumerId;
  publicKey: PublicKeyHex;
  keyPath?: KeyPathInfo;
  label?: string;
}

function rowToKey(row: Record<string, unknown>): RegisteredKey {
  return {
    id: row.id as CryptoKeyId,
    entityType: row.entity_type as "provider" | "consumer",
    entityId: row.entity_id as ProviderId | ConsumerId,
    publicKey: row.public_key as PublicKeyHex,
    keyPath: row.key_path as KeyPathInfo | null,
    label: row.label as string,
    status: row.status as "active" | "revoked",
    createdAt: (row.created_at as Date).toISOString(),
    revokedAt: row.revoked_at ? (row.revoked_at as Date).toISOString() : null,
  };
}

export class PgCryptoKeyRepository {
  constructor(private pool: pg.Pool) {}

  async create(input: CreateKeyInput): Promise<RegisteredKey> {
    const { rows } = await this.pool.query(
      `INSERT INTO crypto_keys (entity_type, entity_id, public_key, key_path, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.entityType,
        input.entityId,
        input.publicKey,
        input.keyPath ? JSON.stringify(input.keyPath) : null,
        input.label ?? "",
      ]
    );
    return rowToKey(rows[0] as Record<string, unknown>);
  }

  /** Look up an active key by public key hex. Hot path for auth. */
  async findByPublicKey(publicKey: string): Promise<RegisteredKey | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM crypto_keys WHERE public_key = $1 AND status = 'active'`,
      [publicKey]
    );
    if (rows.length === 0) return null;
    return rowToKey(rows[0] as Record<string, unknown>);
  }

  /** List all keys for an entity (active and revoked). */
  async listByEntity(
    entityType: "provider" | "consumer",
    entityId: string
  ): Promise<RegisteredKey[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM crypto_keys WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return rows.map((r) => rowToKey(r as Record<string, unknown>));
  }

  /** Revoke a key by ID. */
  async revoke(id: CryptoKeyId): Promise<RegisteredKey | null> {
    const { rows } = await this.pool.query(
      `UPDATE crypto_keys SET status = 'revoked', revoked_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id]
    );
    if (rows.length === 0) return null;
    return rowToKey(rows[0] as Record<string, unknown>);
  }
}
