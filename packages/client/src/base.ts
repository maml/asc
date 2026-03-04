import { AscError } from "./errors.js";

export class BaseClient {
  constructor(
    protected baseUrl: string,
    protected apiKey: string,
  ) {}

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
