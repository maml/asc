// Client-side request signing for secp256k1 signature authentication.
// Uses @noble/curves v2 + @noble/hashes v2.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, hexToBytes } from "@noble/hashes/utils.js";

export interface SignatureHeaders {
  "X-ASC-PublicKey": string;
  "X-ASC-Signature": string;
  "X-ASC-Timestamp": string;
  "X-ASC-Nonce": string;
}

const encoder = new TextEncoder();
const EMPTY_BODY_HASH = bytesToHex(sha256(encoder.encode("")));

/** Build the canonical message string for signing. */
export function buildCanonicalMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body?: string
): string {
  const bodyHash = body && body.length > 0
    ? bytesToHex(sha256(encoder.encode(body)))
    : EMPTY_BODY_HASH;

  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

/** Sign a request, returning the 4 signature headers. */
export function signRequest(
  privateKey: Uint8Array,
  method: string,
  path: string,
  body?: string
): SignatureHeaders {
  const timestamp = new Date().toISOString();
  const nonce = bytesToHex(randomBytes(16));

  const canonical = buildCanonicalMessage(method, path, timestamp, nonce, body);
  const messageHash = sha256(encoder.encode(canonical));
  const signature = secp256k1.sign(messageHash, privateKey);

  const publicKey = bytesToHex(secp256k1.getPublicKey(privateKey, true));
  const signatureHex = bytesToHex(signature);

  return {
    "X-ASC-PublicKey": publicKey,
    "X-ASC-Signature": signatureHex,
    "X-ASC-Timestamp": timestamp,
    "X-ASC-Nonce": nonce,
  };
}
