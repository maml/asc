// Global Fastify onRequest hook for API key authentication.
// Extracts Bearer token, hashes it, looks up provider or consumer.

import type { FastifyRequest, FastifyReply } from "fastify";
import type { ProviderRepository, ConsumerRepository } from "../registry/repository.js";
import type { AuthIdentity } from "./types.js";
import { hashApiKey } from "./utils.js";

// Routes that don't require authentication
const PUBLIC_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/health$/ },
  { method: "POST", pattern: /^\/api\/providers$/ },
  { method: "POST", pattern: /^\/api\/consumers$/ },
  { method: "GET", pattern: /^\/ws/ },
];

function isPublicRoute(method: string, url: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => r.method === method && r.pattern.test(url)
  );
}

// In-memory cache: hash → identity. Keys never change so no TTL needed.
const authCache = new Map<string, AuthIdentity>();
const MAX_CACHE_SIZE = 1000;

export function clearAuthCache(): void {
  authCache.clear();
}

export function buildAuthHook(
  providers: ProviderRepository,
  consumers: ConsumerRepository
) {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Skip auth for public routes
    if (isPublicRoute(request.method, request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header", retryable: false },
      });
      return;
    }

    const token = authHeader.slice(7);
    if (!token.startsWith("asc_")) {
      reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid API key format", retryable: false },
      });
      return;
    }

    const hash = hashApiKey(token);

    // Check cache first
    const cached = authCache.get(hash);
    if (cached) {
      request.identity = cached;
      return;
    }

    // Look up provider first, then consumer
    const provider = await providers.findByApiKeyHash(hash);
    if (provider) {
      const identity: AuthIdentity = { type: "provider", id: provider.id, entity: provider };
      if (authCache.size < MAX_CACHE_SIZE) {
        authCache.set(hash, identity);
      }
      request.identity = identity;
      return;
    }

    const consumer = await consumers.findByApiKeyHash(hash);
    if (consumer) {
      const identity: AuthIdentity = { type: "consumer", id: consumer.id, entity: consumer };
      if (authCache.size < MAX_CACHE_SIZE) {
        authCache.set(hash, identity);
      }
      request.identity = identity;
      return;
    }

    reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Invalid API key", retryable: false },
    });
  };
}
