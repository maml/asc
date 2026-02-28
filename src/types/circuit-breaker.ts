import type { AgentId } from "./brand.js";
import type { Timestamp } from "./common.js";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures before opening
  recoveryTimeoutMs: number;    // Time in open state before trying half-open
  halfOpenMaxAttempts: number;  // Successes needed in half-open to close
  windowMs: number;             // Sliding window for failure counting
}

export interface CircuitBreakerStatus {
  agentId: AgentId;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: Timestamp;
  lastStateChange: Timestamp;
  config: CircuitBreakerConfig;
}
