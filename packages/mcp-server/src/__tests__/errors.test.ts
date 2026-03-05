import { describe, it, expect } from "vitest";
import { AscError, AscTimeoutError } from "@asc-so/client";
import { formatResult, formatError } from "../util/errors.js";

describe("formatResult", () => {
  it("wraps data as JSON text content", () => {
    const data = { id: "task_1", status: "completed" };
    const result = formatResult(data);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(data);
    expect(result.isError).toBeUndefined();
  });
});

describe("formatError", () => {
  it("wraps AscTimeoutError with isError and timeout message", () => {
    const err = new AscTimeoutError("task_abc", 30000);
    const result = formatError(err);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Timeout");
    expect(result.content[0].text).toContain("task_abc");
    expect(result.content[0].text).toContain("check the result later");
  });

  it("wraps AscError with code and retryable info", () => {
    const err = new AscError("RATE_LIMITED", "Too many requests", 429, true);
    const result = formatError(err);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("RATE_LIMITED");
    expect(result.content[0].text).toContain("Too many requests");
    expect(result.content[0].text).toContain("(retryable)");
  });

  it("wraps AscError without retryable suffix when not retryable", () => {
    const err = new AscError("NOT_FOUND", "Service not found", 404, false);
    const result = formatError(err);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error [NOT_FOUND]: Service not found");
    expect(result.content[0].text).not.toContain("retryable");
  });

  it("wraps generic Error", () => {
    const err = new Error("Something broke");
    const result = formatError(err);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: Something broke");
  });

  it("wraps string error", () => {
    const result = formatError("unexpected failure");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: unexpected failure");
  });
});
