import { describe, it, expect, beforeEach } from "vitest";
import { getTestPool, truncateAll } from "../test/setup.js";
import { createFullEntityChain } from "../test/helpers.js";
import { TraceRepository } from "./trace-repo.js";

const pool = getTestPool();
const repo = new TraceRepository(pool);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("TraceRepository", () => {
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it("createTrace returns a traceId", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);

    expect(traceId).toBeDefined();
    expect(traceId).toMatch(UUID_RE);
  });

  it("createSpan returns a spanId", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);

    const { spanId } = await repo.createSpan({
      traceId,
      operationName: "test.operation",
    });

    expect(spanId).toBeDefined();
    expect(spanId).toMatch(UUID_RE);
  });

  it("createSpan with parentSpanId links child to parent", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);

    const parent = await repo.createSpan({
      traceId,
      operationName: "parent.op",
    });
    const child = await repo.createSpan({
      traceId,
      parentSpanId: parent.spanId,
      operationName: "child.op",
    });

    expect(child.spanId).toMatch(UUID_RE);

    const trace = await repo.getTrace(traceId);
    const childSpan = trace!.spans.find((s) => s.spanId === child.spanId);
    expect(childSpan!.parentSpanId).toBe(parent.spanId);
  });

  it("endSpan sets status and durationMs", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);
    const { spanId } = await repo.createSpan({
      traceId,
      operationName: "timed.op",
    });

    await repo.endSpan(spanId, "ok", 142);

    const trace = await repo.getTrace(traceId);
    const span = trace!.spans.find((s) => s.spanId === spanId)!;
    expect(span.status).toBe("ok");
    expect(span.durationMs).toBe(142);
    expect(span.endTime).toBeDefined();
  });

  it("endTrace sets rootSpanId", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);
    const { spanId } = await repo.createSpan({
      traceId,
      operationName: "root.op",
    });

    await repo.endTrace(traceId, spanId);

    const trace = await repo.getTrace(traceId);
    expect(trace!.rootSpanId).toBe(spanId);
    expect(trace!.endTime).toBeDefined();
  });

  it("getTrace returns null for missing traceId", async () => {
    const result = await repo.getTrace("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("getTrace returns trace with spans ordered by start_time", async () => {
    const { coordinationId } = await createFullEntityChain(pool);
    const { traceId } = await repo.createTrace(coordinationId);

    const span1 = await repo.createSpan({
      traceId,
      operationName: "first.op",
      attributes: { step: "1" },
    });
    const span2 = await repo.createSpan({
      traceId,
      operationName: "second.op",
      attributes: { step: "2" },
    });

    await repo.endSpan(span1.spanId, "ok", 50);
    await repo.endSpan(span2.spanId, "error", 75);
    await repo.endTrace(traceId, span1.spanId);

    const trace = await repo.getTrace(traceId);

    expect(trace).not.toBeNull();
    expect(trace!.traceId).toBe(traceId);
    expect(trace!.coordinationId).toBe(coordinationId);
    expect(trace!.rootSpanId).toBe(span1.spanId);
    expect(trace!.spans).toHaveLength(2);
    // Ordered by start_time ASC — span1 was created first
    expect(trace!.spans[0].operationName).toBe("first.op");
    expect(trace!.spans[1].operationName).toBe("second.op");
    expect(trace!.spans[0].attributes).toEqual({ step: "1" });
    expect(trace!.spans[1].status).toBe("error");
  });

  it("listTraces returns traces with spans batch-loaded", async () => {
    const { coordinationId } = await createFullEntityChain(pool);

    // Create two traces, each with a span
    const t1 = await repo.createTrace(coordinationId);
    await repo.createSpan({ traceId: t1.traceId, operationName: "t1.span" });

    const t2 = await repo.createTrace(coordinationId);
    await repo.createSpan({ traceId: t2.traceId, operationName: "t2.span" });

    const { traces, hasMore } = await repo.listTraces({ limit: 10 });

    // +1 for the trace auto-created by createFullEntityChain via coordinations table
    expect(traces.length).toBeGreaterThanOrEqual(2);
    expect(hasMore).toBe(false);

    // Each of our traces should have its span attached
    const ourTraces = traces.filter(
      (t) => t.traceId === t1.traceId || t.traceId === t2.traceId
    );
    for (const t of ourTraces) {
      expect(t.spans.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("listTraces hasMore pagination", async () => {
    const { coordinationId } = await createFullEntityChain(pool);

    // Create 3 traces (createFullEntityChain does NOT create traces)
    for (let i = 0; i < 3; i++) {
      await repo.createTrace(coordinationId);
    }

    // Request limit=2 — should get 2 traces with hasMore=true
    const page1 = await repo.listTraces({ limit: 2 });
    expect(page1.traces).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    // Verify all traces are fetchable (total = 3)
    const all = await repo.listTraces({ limit: 10 });
    expect(all.traces).toHaveLength(3);
    expect(all.hasMore).toBe(false);
  });
});
