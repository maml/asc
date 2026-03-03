// Shared API key generation and hashing utilities.

import crypto from "node:crypto";

export function generateApiKey(): string {
  return `asc_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
