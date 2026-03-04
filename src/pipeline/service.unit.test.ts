import { describe, it, expect } from "vitest";
import { applyMapping } from "./service.js";

describe("applyMapping", () => {
  it("returns input unchanged with empty mapping", () => {
    const input = { a: 1, b: 2 };
    const result = applyMapping(input, []);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("pick keeps only listed fields", () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = applyMapping(input, [{ op: "pick", fields: ["a", "c"] }]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("pick ignores missing fields", () => {
    const input = { a: 1 };
    const result = applyMapping(input, [
      { op: "pick", fields: ["a", "missing"] },
    ]);
    expect(result).toEqual({ a: 1 });
  });

  it("merge adds static values", () => {
    const input = { a: 1 };
    const result = applyMapping(input, [{ op: "merge", value: { b: 2 } }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("merge overwrites existing keys", () => {
    const input = { a: 1 };
    const result = applyMapping(input, [{ op: "merge", value: { a: 99 } }]);
    expect(result).toEqual({ a: 99 });
  });

  it("pick then merge composes", () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = applyMapping(input, [
      { op: "pick", fields: ["a"] },
      { op: "merge", value: { d: 4 } },
    ]);
    expect(result).toEqual({ a: 1, d: 4 });
  });

  it("non-object input starts with empty object", () => {
    const input = "hello";
    const result = applyMapping(input, [{ op: "merge", value: { a: 1 } }]);
    expect(result).toEqual({ a: 1 });
  });

  it("null input starts with empty object", () => {
    const input = null;
    const result = applyMapping(input, [{ op: "merge", value: { a: 1 } }]);
    expect(result).toEqual({ a: 1 });
  });
});
