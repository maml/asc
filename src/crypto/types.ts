// Crypto identity types for secp256k1 signature authentication.

import type { CryptoKeyId, ProviderId, ConsumerId } from "../types/brand.js";

// Compressed secp256k1 public key as 66-char hex string
declare const __pubkey: unique symbol;
export type PublicKeyHex = string & { readonly [__pubkey]: true };

export interface RegisteredKey {
  id: CryptoKeyId;
  entityType: "provider" | "consumer";
  entityId: ProviderId | ConsumerId;
  publicKey: PublicKeyHex;
  keyPath: KeyPathInfo | null;
  label: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
}

export interface KeyPathInfo {
  purpose: number;
  orgIndex: number;
  scope: "provider-auth" | "consumer-auth" | "delegation";
  childIndex: number;
}

export interface SignatureHeaders {
  publicKey: string;
  signature: string;
  timestamp: string;
  nonce: string;
}

export interface CanonicalMessage {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}

// Fastify request augmentation for raw body capture
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
