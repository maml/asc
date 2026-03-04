// Request signing and verification using secp256k1 + SHA-256.
// Uses @noble/curves v2 + @noble/hashes v2.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import type { SignatureHeaders } from "./types.js";

const encoder = new TextEncoder();
const EMPTY_BODY_HASH = bytesToHex(sha256(encoder.encode("")));

/** Build the canonical message string for signing. */
export function buildCanonicalMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body?: string | Buffer
): string {
  let bodyHash: string;
  if (body && body.length > 0) {
    const bodyBytes = typeof body === "string" ? encoder.encode(body) : new Uint8Array(body);
    bodyHash = bytesToHex(sha256(bodyBytes));
  } else {
    bodyHash = EMPTY_BODY_HASH;
  }

  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

/** Sign a request, returning the 4 required headers. */
export function signRequest(
  privateKey: Uint8Array,
  method: string,
  path: string,
  body?: string | Buffer
): SignatureHeaders {
  const timestamp = new Date().toISOString();
  const nonce = bytesToHex(randomBytes(16));

  const canonical = buildCanonicalMessage(method, path, timestamp, nonce, body);
  const messageHash = sha256(encoder.encode(canonical));
  const signature = secp256k1.sign(messageHash, privateKey);

  // Compact 64-byte hex (r || s)
  const publicKey = bytesToHex(secp256k1.getPublicKey(privateKey, true));
  const signatureHex = bytesToHex(signature);

  return {
    publicKey,
    signature: signatureHex,
    timestamp,
    nonce,
  };
}

/** Verify a signature against a public key and canonical message. */
export function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  canonicalMessage: string
): boolean {
  try {
    const messageHash = sha256(encoder.encode(canonicalMessage));
    const sigBytes = hexToBytes(signatureHex);
    const pubBytes = hexToBytes(publicKeyHex);
    return secp256k1.verify(sigBytes, messageHash, pubBytes);
  } catch {
    return false;
  }
}

// -- Replay protection --

interface NonceEntry {
  expiresAt: number;
}

export class NonceCache {
  private cache = new Map<string, NonceEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000, cleanupIntervalMs = 60 * 1000) {
    this.ttlMs = ttlMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /** Returns true if the nonce is new (not seen before). */
  check(nonce: string): boolean {
    if (this.cache.has(nonce)) return false;
    this.cache.set(nonce, { expiresAt: Date.now() + this.ttlMs });
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
