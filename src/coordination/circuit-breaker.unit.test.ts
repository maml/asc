import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreakerManager } from "./circuit-breaker.js";
import type { AgentId } from "../types/brand.js";

const agent = (id: string) => id as AgentId;

describe("CircuitBreakerManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state with canExecute=true", () => {
    const cb = new CircuitBreakerManager();
    const id = agent("agent-1");

    expect(cb.getState(id)).toEqual({ state: "closed", failureCount: 0 });
    expect(cb.canExecute(id)).toBe(true);
  });

  it("transitions closed→open after failureThreshold failures", () => {
    const cb = new CircuitBreakerManager({ defaultConfig: { failureThreshold: 3 } });
    const id = agent("agent-1");

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("closed");

    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("open");
  });

  it("blocks canExecute when open", () => {
    const cb = new CircuitBreakerManager({ defaultConfig: { failureThreshold: 2 } });
    const id = agent("agent-1");

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("open");
    expect(cb.canExecute(id)).toBe(false);
  });

  it("transitions open→half_open after recoveryTimeoutMs", () => {
    const cb = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 2, recoveryTimeoutMs: 5000 },
    });
    const id = agent("agent-1");

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("open");
    expect(cb.canExecute(id)).toBe(false);

    vi.advanceTimersByTime(5000);

    expect(cb.canExecute(id)).toBe(true);
    expect(cb.getState(id).state).toBe("half_open");
  });

  it("transitions half_open→closed after halfOpenMaxAttempts successes", () => {
    const cb = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 2, recoveryTimeoutMs: 1000, halfOpenMaxAttempts: 3 },
    });
    const id = agent("agent-1");

    // Get to half_open
    cb.recordFailure(id);
    cb.recordFailure(id);
    vi.advanceTimersByTime(1000);
    cb.canExecute(id); // triggers transition to half_open

    cb.recordSuccess(id);
    cb.recordSuccess(id);
    expect(cb.getState(id).state).toBe("half_open");

    cb.recordSuccess(id);
    expect(cb.getState(id).state).toBe("closed");
    expect(cb.getState(id).failureCount).toBe(0);
  });

  it("transitions half_open→open on any failure", () => {
    const cb = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 2, recoveryTimeoutMs: 1000 },
    });
    const id = agent("agent-1");

    // Get to half_open
    cb.recordFailure(id);
    cb.recordFailure(id);
    vi.advanceTimersByTime(1000);
    cb.canExecute(id);
    expect(cb.getState(id).state).toBe("half_open");

    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("open");
  });

  it("does not count failures outside the sliding windowMs", () => {
    const cb = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 3, windowMs: 10_000 },
    });
    const id = agent("agent-1");

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).failureCount).toBe(2);

    // Move past the window — next failure resets the count
    vi.advanceTimersByTime(11_000);

    cb.recordFailure(id);
    // failureCount resets to 1 because the previous failures are outside the window
    expect(cb.getState(id).failureCount).toBe(1);
    expect(cb.getState(id).state).toBe("closed");
  });

  it("resets failure count on success while closed", () => {
    const cb = new CircuitBreakerManager({ defaultConfig: { failureThreshold: 5 } });
    const id = agent("agent-1");

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).failureCount).toBe(2);

    cb.recordSuccess(id);
    expect(cb.getState(id).failureCount).toBe(0);
  });

  it("fires onStateChange callback with correct arguments", () => {
    const onChange = vi.fn();
    const cb = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 2, recoveryTimeoutMs: 1000, halfOpenMaxAttempts: 1 },
      onStateChange: onChange,
    });
    const id = agent("agent-1");

    // closed → open
    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(onChange).toHaveBeenCalledWith(id, "closed", "open");

    // open → half_open
    vi.advanceTimersByTime(1000);
    cb.canExecute(id);
    expect(onChange).toHaveBeenCalledWith(id, "open", "half_open");

    // half_open → closed
    cb.recordSuccess(id);
    expect(onChange).toHaveBeenCalledWith(id, "half_open", "closed");

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("does not fire onStateChange for same-state transitions", () => {
    const onChange = vi.fn();
    const cb = new CircuitBreakerManager({ onStateChange: onChange });
    const id = agent("agent-1");

    // Successes while closed should not fire a transition
    cb.recordSuccess(id);
    cb.recordSuccess(id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("configure() overrides per-agent thresholds", () => {
    const cb = new CircuitBreakerManager({ defaultConfig: { failureThreshold: 5 } });
    const id = agent("agent-1");

    cb.configure(id, { failureThreshold: 2 });

    cb.recordFailure(id);
    cb.recordFailure(id);
    expect(cb.getState(id).state).toBe("open");
  });

  it("maintains independent breaker state per agent", () => {
    const cb = new CircuitBreakerManager({ defaultConfig: { failureThreshold: 2 } });
    const a1 = agent("agent-1");
    const a2 = agent("agent-2");

    cb.recordFailure(a1);
    cb.recordFailure(a1);
    expect(cb.getState(a1).state).toBe("open");

    // agent-2 should be unaffected
    expect(cb.getState(a2).state).toBe("closed");
    expect(cb.canExecute(a2)).toBe(true);
    expect(cb.getState(a2).failureCount).toBe(0);
  });

  it("BUG: constructor mutates the module-level DEFAULT_CONFIG via Object.assign", () => {
    // First instance overrides the module-level DEFAULT_CONFIG
    const cb1 = new CircuitBreakerManager({
      defaultConfig: { failureThreshold: 1 },
    });
    const id1 = agent("agent-a");

    // A second instance with NO config picks up the mutated DEFAULT_CONFIG
    const cb2 = new CircuitBreakerManager();
    const id2 = agent("agent-b");

    // cb2 should have the original threshold of 5, but because the constructor
    // does Object.assign(DEFAULT_CONFIG, opts.defaultConfig), the module-level
    // constant was mutated to failureThreshold=1 by cb1.
    cb2.recordFailure(id2);

    // This demonstrates the bug: one failure is enough to open the circuit
    // because DEFAULT_CONFIG.failureThreshold was mutated from 5 to 1.
    expect(cb2.getState(id2).state).toBe("open");

    // Verify the breaker created by cb1 also uses threshold=1
    cb1.recordFailure(id1);
    expect(cb1.getState(id1).state).toBe("open");
  });
});
