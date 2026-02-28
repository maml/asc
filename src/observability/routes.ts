// REST routes for the observability layer (traces, spans, SLA, quality)

import type { FastifyInstance } from "fastify";
import type { TraceId } from "../types/brand.js";
import type { TraceService } from "./trace-service.js";
import type { SlaService } from "./sla-service.js";
import type { QualityService } from "./quality-service.js";

export function registerObservabilityRoutes(
  app: FastifyInstance,
  traceService: TraceService,
  slaService: SlaService,
  qualityService: QualityService
): void {
  // ─── Trace routes ───

  // List traces
  app.get("/api/traces", async (req) => {
    const query = req.query as { limit?: string; offset?: string };
    const result = await traceService.listTraces({
      limit: parseInt(query.limit ?? "20", 10),
      offset: query.offset,
    });
    return { data: { traces: result.traces, hasMore: result.hasMore } };
  });

  // Get a single trace with all spans
  app.get("/api/traces/:traceId", async (req, reply) => {
    const { traceId } = req.params as { traceId: string };
    const trace = await traceService.getTrace(traceId);
    if (!trace) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Trace not found", retryable: false },
      });
    }
    return { data: { trace } };
  });

  // ─── SLA routes ───

  // Create SLA rule
  app.post("/api/sla-rules", async (req, reply) => {
    const body = req.body as {
      agentId: string;
      providerId: string;
      metricType: string;
      threshold: number;
      windowMinutes?: number;
    };
    const rule = await slaService.createRule(body as Parameters<SlaService["createRule"]>[0]);
    return reply.status(201).send({ data: { rule } });
  });

  // List SLA rules
  app.get("/api/sla-rules", async (req) => {
    const query = req.query as { agentId?: string; limit?: string };
    const rules = await slaService.listRules({
      agentId: query.agentId,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { rules } };
  });

  // Delete SLA rule
  app.delete("/api/sla-rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await slaService.deleteRule(id);
    return reply.status(204).send();
  });

  // Evaluate SLA rules for an agent
  app.post("/api/sla-rules/evaluate", async (req) => {
    const body = req.body as { agentId: string };
    const records = await slaService.evaluateRules(body.agentId);
    return { data: { records } };
  });

  // List SLA compliance records
  app.get("/api/sla-compliance", async (req) => {
    const query = req.query as { agentId?: string; ruleId?: string; limit?: string };
    const records = await slaService.listComplianceRecords({
      agentId: query.agentId,
      ruleId: query.ruleId,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { records } };
  });

  // ─── Quality routes ───

  // Create quality gate
  app.post("/api/quality-gates", async (req, reply) => {
    const body = req.body as {
      agentId: string;
      name: string;
      description?: string;
      checkConfig: unknown;
      required?: boolean;
    };
    const gate = await qualityService.createGate(body as Parameters<QualityService["createGate"]>[0]);
    return reply.status(201).send({ data: { gate } });
  });

  // List quality gates
  app.get("/api/quality-gates", async (req) => {
    const query = req.query as { agentId?: string; limit?: string };
    const gates = await qualityService.listGates({
      agentId: query.agentId,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { gates } };
  });

  // Delete quality gate
  app.delete("/api/quality-gates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await qualityService.deleteGate(id);
    return reply.status(204).send();
  });

  // List quality check records
  app.get("/api/quality-checks", async (req) => {
    const query = req.query as { gateId?: string; taskId?: string; limit?: string };
    const records = await qualityService.listCheckRecords({
      gateId: query.gateId,
      taskId: query.taskId,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { data: { records } };
  });
}
