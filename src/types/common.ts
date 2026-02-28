// Shared primitives used across the domain model.

/** ISO 8601 string — no Date objects, stays JSON-serializable */
export type Timestamp = string;

/** Integer cents to avoid floating-point drift (Stripe pattern) */
export interface Money {
  amountCents: number;
  currency: string; // ISO 4217, e.g. "USD"
}

/** Cursor-based pagination */
export interface PaginationRequest {
  cursor?: string;
  limit: number;
}

export interface PaginationResponse {
  nextCursor?: string;
  hasMore: boolean;
}

/** Standardized API error shape */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

/** Metadata bag attached to most entities */
export type Metadata = Record<string, string>;

/** Standard status for async operations */
export type OperationStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";
