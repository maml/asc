import { AscError } from "./errors.js";
import { signRequest } from "./signing.js";

export interface SigningConfig {
  privateKey: Uint8Array;
}

export class BaseClient {
  private signingConfig?: SigningConfig;

  constructor(
    protected baseUrl: string,
    protected apiKey: string,
    signingConfig?: SigningConfig,
  ) {
    this.signingConfig = signingConfig;
  }

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.signingConfig) {
      // Signature auth — sign the request with private key
      const sigHeaders = signRequest(this.signingConfig.privateKey, method, path, bodyStr);
      Object.assign(headers, sigHeaders);
    } else {
      // API key auth
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    // 204 No Content — nothing to parse
    if (res.status === 204) {
      return undefined as T;
    }

    const json = (await res.json()) as
      | { data: T; error?: never }
      | { data?: never; error: { code: string; message: string; retryable: boolean } };

    if (!res.ok || json.error) {
      const err = json.error ?? { code: "UNKNOWN", message: res.statusText, retryable: false };
      throw new AscError(err.code, err.message, res.status, err.retryable);
    }

    return json.data as T;
  }
}

// Standalone helper for unauthenticated registration endpoints
export async function unauthenticatedPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as
    | { data: T; error?: never }
    | { data?: never; error: { code: string; message: string; retryable: boolean } };

  if (!res.ok || json.error) {
    const err = json.error ?? { code: "UNKNOWN", message: res.statusText, retryable: false };
    throw new AscError(err.code, err.message, res.status, err.retryable);
  }

  return json.data as T;
}
