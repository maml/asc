// Shared API key generation and hashing utilities.

import crypto from "node:crypto";

export function generateApiKey(environment?: "sandbox" | "production"): string {
  const prefix =
    environment === "sandbox" ? "asc_test_" :
    environment === "production" ? "asc_live_" :
    "asc_";
  return `${prefix}${crypto.randomBytes(32).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
