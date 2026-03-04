// Key management API routes: register, list, and revoke crypto keys.

import type { FastifyInstance } from "fastify";
import type { PgCryptoKeyRepository } from "./repository.js";
import type { CryptoKeyId } from "../types/brand.js";
import { isValidPublicKey } from "./keys.js";

export function registerCryptoRoutes(
  app: FastifyInstance,
  cryptoKeyRepo: PgCryptoKeyRepository
): void {
  // Register a public key for the authenticated entity
  app.post("/api/keys", async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required", retryable: false },
      });
    }

    const body = request.body as { publicKey?: string; keyPath?: unknown; label?: string };

    if (!body.publicKey || !isValidPublicKey(body.publicKey)) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid or missing publicKey. Must be a compressed secp256k1 key (66 hex chars)",
          retryable: false,
        },
      });
    }

    try {
      const key = await cryptoKeyRepo.create({
        entityType: identity.type,
        entityId: identity.id,
        publicKey: body.publicKey,
        keyPath: body.keyPath as any,
        label: body.label,
      });
      return reply.status(201).send({ data: key });
    } catch (err: any) {
      // Unique constraint violation — key already registered
      if (err.code === "23505") {
        return reply.status(409).send({
          error: { code: "CONFLICT", message: "Public key already registered", retryable: false },
        });
      }
      throw err;
    }
  });

  // List keys for the authenticated entity
  app.get("/api/keys", async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required", retryable: false },
      });
    }

    const keys = await cryptoKeyRepo.listByEntity(identity.type, identity.id);
    return reply.send({ data: keys });
  });

  // Revoke a key
  app.delete("/api/keys/:keyId", async (request, reply) => {
    const identity = request.identity;
    if (!identity) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required", retryable: false },
      });
    }

    const { keyId } = request.params as { keyId: string };

    // Verify the key belongs to the caller before revoking
    const keys = await cryptoKeyRepo.listByEntity(identity.type, identity.id);
    const targetKey = keys.find((k) => k.id === keyId);
    if (!targetKey) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Key not found", retryable: false },
      });
    }

    if (targetKey.status === "revoked") {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Key already revoked", retryable: false },
      });
    }

    const revoked = await cryptoKeyRepo.revoke(keyId as CryptoKeyId);
    return reply.send({ data: revoked });
  });
}
