// Signature verification Fastify preHandler hook.
// Extracts signature headers, validates timestamp/nonce, verifies secp256k1 sig,
// looks up the public key in the DB, and sets request.identity.

import type { FastifyRequest, FastifyReply } from "fastify";
import type { ProviderRepository, ConsumerRepository } from "../registry/repository.js";
import type { ProviderId, ConsumerId } from "../types/brand.js";
import type { AuthIdentity } from "../auth/types.js";
import type { PgCryptoKeyRepository } from "./repository.js";
import { buildCanonicalMessage, verifySignature, NonceCache } from "./signing.js";

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // ±5 minutes

export function buildSignatureAuthHook(
  cryptoKeyRepo: PgCryptoKeyRepository,
  providers: ProviderRepository,
  consumers: ConsumerRepository
) {
  const nonceCache = new NonceCache();

  return async function signatureAuthHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Skip if identity already set (API key auth handled it)
    if (request.identity) return;

    const pubKeyHeader = request.headers["x-asc-publickey"] as string | undefined;
    const sigHeader = request.headers["x-asc-signature"] as string | undefined;
    const tsHeader = request.headers["x-asc-timestamp"] as string | undefined;
    const nonceHeader = request.headers["x-asc-nonce"] as string | undefined;

    // No signature headers — let the route handler decide if auth is required
    if (!sigHeader && !pubKeyHeader) return;

    // Partial headers = bad request
    if (!pubKeyHeader || !sigHeader || !tsHeader || !nonceHeader) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Incomplete signature headers. Require X-ASC-PublicKey, X-ASC-Signature, X-ASC-Timestamp, X-ASC-Nonce",
          retryable: false,
        },
      });
      return;
    }

    // Validate timestamp window
    const ts = new Date(tsHeader).getTime();
    if (isNaN(ts)) {
      reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Invalid timestamp format", retryable: false },
      });
      return;
    }

    const drift = Math.abs(Date.now() - ts);
    if (drift > TIMESTAMP_WINDOW_MS) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Request timestamp outside acceptable window", retryable: true },
      });
      return;
    }

    // Check nonce uniqueness (replay protection)
    if (!nonceCache.check(nonceHeader)) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Duplicate nonce (possible replay)", retryable: false },
      });
      return;
    }

    // Build canonical message and verify signature
    const body = request.rawBody ? request.rawBody : undefined;
    const canonical = buildCanonicalMessage(
      request.method,
      request.url,
      tsHeader,
      nonceHeader,
      body
    );

    if (!verifySignature(pubKeyHeader, sigHeader, canonical)) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid signature", retryable: false },
      });
      return;
    }

    // Look up the public key in DB
    const registeredKey = await cryptoKeyRepo.findByPublicKey(pubKeyHeader);
    if (!registeredKey) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Public key not registered", retryable: false },
      });
      return;
    }

    // Load the entity
    let identity: AuthIdentity | null = null;

    if (registeredKey.entityType === "provider") {
      const provider = await providers.findById(registeredKey.entityId as ProviderId);
      if (provider) {
        identity = {
          type: "provider",
          id: provider.id,
          entity: provider,
          authMethod: "signature",
        };
      }
    } else {
      const consumer = await consumers.findById(registeredKey.entityId as ConsumerId);
      if (consumer) {
        identity = {
          type: "consumer",
          id: consumer.id,
          entity: consumer,
          authMethod: "signature",
        };
      }
    }

    if (!identity) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Entity not found for registered key", retryable: false },
      });
      return;
    }

    request.identity = identity;
  };
}
