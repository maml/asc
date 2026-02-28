// In-memory circuit breaker per agent. Wraps provider invocations to
// prevent cascading failures when a provider is unhealthy.

import type { AgentId } from "../types/brand.js";
import type { CircuitBreakerConfig, CircuitState } from "../types/circuit-breaker.js";

interface BreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number;
  lastStateChange: number;
  config: CircuitBreakerConfig;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenMaxAttempts: 3,
  windowMs: 60_000,
};

export class CircuitBreakerManager {
  private breakers = new Map<string, BreakerState>();
  private onStateChange?: (agentId: AgentId, from: CircuitState, to: CircuitState) => void;

  constructor(opts?: {
    defaultConfig?: Partial<CircuitBreakerConfig>;
    onStateChange?: (agentId: AgentId, from: CircuitState, to: CircuitState) => void;
  }) {
    if (opts?.defaultConfig) {
      Object.assign(DEFAULT_CONFIG, opts.defaultConfig);
    }
    this.onStateChange = opts?.onStateChange;
  }

  private getBreaker(agentId: AgentId): BreakerState {
    let b = this.breakers.get(agentId);
    if (!b) {
      b = {
        state: "closed",
        failureCount: 0,
        successCount: 0,
        lastFailureAt: 0,
        lastStateChange: Date.now(),
        config: { ...DEFAULT_CONFIG },
      };
      this.breakers.set(agentId, b);
    }
    return b;
  }

  private transition(agentId: AgentId, breaker: BreakerState, to: CircuitState): void {
    const from = breaker.state;
    if (from === to) return;
    breaker.state = to;
    breaker.lastStateChange = Date.now();
    this.onStateChange?.(agentId, from, to);
  }

  /** Check if a request is allowed through the circuit */
  canExecute(agentId: AgentId): boolean {
    const b = this.getBreaker(agentId);
    const now = Date.now();

    switch (b.state) {
      case "closed":
        return true;

      case "open": {
        // Check if recovery timeout has elapsed → transition to half-open
        if (now - b.lastStateChange >= b.config.recoveryTimeoutMs) {
          this.transition(agentId, b, "half_open");
          b.successCount = 0;
          return true;
        }
        return false;
      }

      case "half_open":
        return true;
    }
  }

  /** Record a successful invocation */
  recordSuccess(agentId: AgentId): void {
    const b = this.getBreaker(agentId);

    switch (b.state) {
      case "closed":
        // Reset failure count on success within window
        b.failureCount = 0;
        break;

      case "half_open":
        b.successCount++;
        if (b.successCount >= b.config.halfOpenMaxAttempts) {
          b.failureCount = 0;
          this.transition(agentId, b, "closed");
        }
        break;

      case "open":
        // Shouldn't happen, but handle gracefully
        break;
    }
  }

  /** Record a failed invocation */
  recordFailure(agentId: AgentId): void {
    const b = this.getBreaker(agentId);
    const now = Date.now();

    switch (b.state) {
      case "closed": {
        // Reset count if outside the sliding window
        if (now - b.lastFailureAt > b.config.windowMs) {
          b.failureCount = 0;
        }
        b.failureCount++;
        b.lastFailureAt = now;

        if (b.failureCount >= b.config.failureThreshold) {
          this.transition(agentId, b, "open");
        }
        break;
      }

      case "half_open":
        // Any failure in half-open goes back to open
        b.failureCount++;
        b.lastFailureAt = now;
        this.transition(agentId, b, "open");
        break;

      case "open":
        b.lastFailureAt = now;
        break;
    }
  }

  /** Get the current state for monitoring */
  getState(agentId: AgentId): { state: CircuitState; failureCount: number } {
    const b = this.getBreaker(agentId);
    return { state: b.state, failureCount: b.failureCount };
  }

  /** Configure a specific agent's breaker */
  configure(agentId: AgentId, config: Partial<CircuitBreakerConfig>): void {
    const b = this.getBreaker(agentId);
    Object.assign(b.config, config);
  }
}
