// Barrel export for crypto identity module.

export { generateKeypair, deriveMasterKey, deriveChildKey, deriveKeyPath, isValidPublicKey } from "./keys.js";
export type { Keypair } from "./keys.js";
export { buildCanonicalMessage, signRequest, verifySignature, NonceCache } from "./signing.js";
export { PgCryptoKeyRepository } from "./repository.js";
export { buildSignatureAuthHook } from "./verify.js";
export { registerCryptoRoutes } from "./routes.js";
export type {
  PublicKeyHex,
  RegisteredKey,
  KeyPathInfo,
  SignatureHeaders,
  CanonicalMessage,
} from "./types.js";
