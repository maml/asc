// Route-level authorization guards.
// Call these in route handlers after the auth hook has attached identity.

import type { FastifyRequest, FastifyReply } from "fastify";
import type { ProviderId, ConsumerId } from "../types/brand.js";

// Returns true if authorization failed (reply already sent).
// Returns false if the request is authorized to proceed.

export function requireProvider(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredId?: ProviderId
): boolean {
  const identity = request.identity;
  if (!identity || identity.type !== "provider") {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Provider access required", retryable: false },
    });
    return true;
  }
  if (requiredId && identity.id !== requiredId) {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Access denied to this resource", retryable: false },
    });
    return true;
  }
  return false;
}

export function requireConsumer(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredId?: ConsumerId
): boolean {
  const identity = request.identity;
  if (!identity || identity.type !== "consumer") {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Consumer access required", retryable: false },
    });
    return true;
  }
  if (requiredId && identity.id !== requiredId) {
    reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Access denied to this resource", retryable: false },
    });
    return true;
  }
  return false;
}
