// Client-side key generation and BIP-32 HD derivation.
// Uses @noble/curves v2 + @noble/hashes v2.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { KeyPathInfo } from "./types.js";

const DOMAIN_SEPARATOR = "asc-identity";

const SCOPE_INDEX: Record<string, number> = {
  "provider-auth": 0,
  "consumer-auth": 1,
  delegation: 2,
};

export interface Keypair {
  privateKey: Uint8Array;
  publicKey: string;
}

interface DerivedKey {
  key: Uint8Array;
  chainCode: Uint8Array;
}

const encoder = new TextEncoder();

/** Generate a random secp256k1 keypair. */
export function generateKeypair(): Keypair {
  const privateKey = secp256k1.utils.randomSecretKey();
  const publicKey = bytesToHex(secp256k1.getPublicKey(privateKey, true));
  return { privateKey, publicKey };
}

/** Derive a master key + chain code from a seed. */
export function deriveMasterKey(seed: Uint8Array): DerivedKey {
  const I = hmac(sha512, encoder.encode(DOMAIN_SEPARATOR), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** Hardened child key derivation. */
export function deriveChildKey(
  parentKey: Uint8Array,
  chainCode: Uint8Array,
  index: number
): DerivedKey {
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parentKey, 1);
  const hardenedIndex = (index + 0x80000000) >>> 0;
  data[33] = (hardenedIndex >>> 24) & 0xff;
  data[34] = (hardenedIndex >>> 16) & 0xff;
  data[35] = (hardenedIndex >>> 8) & 0xff;
  data[36] = hardenedIndex & 0xff;

  const I = hmac(sha512, chainCode, data);
  const childKey = I.slice(0, 32);
  const childChainCode = I.slice(32);

  const parentBigInt = bytesToBigInt(parentKey);
  const childBigInt = bytesToBigInt(childKey);
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const derivedBytes = bigIntToBytes((parentBigInt + childBigInt) % N);

  return { key: derivedBytes, chainCode: childChainCode };
}

/** Derive a key using BIP-32 path: m/purpose'/orgIndex'/scope'/childIndex' */
export function deriveKeyPath(seed: Uint8Array, path: KeyPathInfo): Keypair {
  const { key: masterKey, chainCode: masterChainCode } = deriveMasterKey(seed);

  const scopeIdx = SCOPE_INDEX[path.scope] ?? 0;
  const steps = [path.purpose, path.orgIndex, scopeIdx, path.childIndex];
  let currentKey = masterKey;
  let currentChainCode = masterChainCode;

  for (const index of steps) {
    const derived = deriveChildKey(currentKey, currentChainCode, index);
    currentKey = derived.key;
    currentChainCode = derived.chainCode;
  }

  const publicKey = bytesToHex(secp256k1.getPublicKey(currentKey, true));
  return { privateKey: currentKey, publicKey };
}

/** Validate compressed secp256k1 public key hex. */
export function isValidPublicKey(hex: string): boolean {
  if (!/^(02|03)[0-9a-f]{64}$/i.test(hex)) return false;
  try {
    secp256k1.Point.fromHex(hex);
    return true;
  } catch {
    return false;
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function bigIntToBytes(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let remaining = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}
