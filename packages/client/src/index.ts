export { AscProvider, registerProvider } from "./provider.js";
export type { AscProviderOptions } from "./provider.js";

export { AscConsumer, registerConsumer } from "./consumer.js";
export type { AscConsumerOptions } from "./consumer.js";

export { AscError, AscTimeoutError } from "./errors.js";

export { generateKeypair, deriveMasterKey, deriveChildKey, deriveKeyPath, isValidPublicKey } from "./keys.js";
export type { Keypair } from "./keys.js";

export { signRequest, buildCanonicalMessage } from "./signing.js";
export type { SignatureHeaders } from "./signing.js";

export type { SigningConfig } from "./base.js";

export * from "./types.js";
