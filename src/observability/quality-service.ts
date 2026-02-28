// Quality service — runs quality checks against gates for a given task

import type { QualityGateRepository } from "./quality-repo.js";
import type {
  QualityGate,
  QualityCheckConfig,
  QualityCheckResult,
  QualityCheckRecord,
} from "../types/quality.js";

export class QualityService {
  constructor(private repo: QualityGateRepository) {}

  // --- Delegated CRUD ---

  createGate(data: Parameters<QualityGateRepository["createGate"]>[0]) {
    return this.repo.createGate(data);
  }

  listGates(opts?: Parameters<QualityGateRepository["listGates"]>[0]) {
    return this.repo.listGates(opts);
  }

  deleteGate(id: string) {
    return this.repo.deleteGate(id);
  }

  listCheckRecords(opts: Parameters<QualityGateRepository["listCheckRecords"]>[0]) {
    return this.repo.listCheckRecords(opts);
  }

  // --- Core check runner ---

  async runChecks(
    agentId: string,
    taskId: string,
    output: unknown,
    durationMs: number
  ): Promise<{ records: QualityCheckRecord[]; passed: boolean }> {
    const gates = await this.repo.listGates({ agentId });
    const records: QualityCheckRecord[] = [];

    for (const gate of gates) {
      const { result, message } = this.evaluateCheck(gate.check, output, durationMs);

      const record = await this.repo.recordCheck({
        gateId: gate.id,
        taskId,
        result,
        message,
        durationMs,
      });

      records.push(record);
    }

    // passed = true unless a required gate has result "fail"
    const requiredGateIds = new Set(
      gates.filter((g) => g.required).map((g) => g.id)
    );
    const passed = !records.some(
      (r) => requiredGateIds.has(r.gateId) && r.result === "fail"
    );

    return { records, passed };
  }

  // --- Check evaluators ---

  private evaluateCheck(
    config: QualityCheckConfig,
    output: unknown,
    durationMs: number
  ): { result: QualityCheckResult; message?: string } {
    switch (config.type) {
      case "json_schema":
        return this.checkJsonSchema(output);
      case "latency_threshold":
        return this.checkLatency(durationMs, config.maxMs);
      case "output_regex":
        return this.checkRegex(output, config.pattern, config.flags);
      case "custom_webhook":
        return { result: "skip", message: "Custom webhooks not yet implemented" };
    }
  }

  /** V1: just validate output is parseable JSON and not null/undefined */
  private checkJsonSchema(output: unknown): { result: QualityCheckResult; message?: string } {
    try {
      const value = typeof output === "string" ? JSON.parse(output) : output;
      if (value === null || value === undefined) {
        return { result: "fail", message: "Output is null or undefined" };
      }
      return { result: "pass" };
    } catch {
      return { result: "fail", message: "Output is not valid JSON" };
    }
  }

  private checkLatency(
    durationMs: number,
    maxMs: number
  ): { result: QualityCheckResult; message?: string } {
    if (durationMs <= maxMs) {
      return { result: "pass" };
    }
    return {
      result: "fail",
      message: `Latency ${durationMs}ms exceeds threshold ${maxMs}ms`,
    };
  }

  private checkRegex(
    output: unknown,
    pattern: string,
    flags?: string
  ): { result: QualityCheckResult; message?: string } {
    if (typeof output !== "string") {
      return { result: "fail", message: "Output is not a string, cannot test regex" };
    }

    try {
      const re = new RegExp(pattern, flags);
      if (re.test(output)) {
        return { result: "pass" };
      }
      return { result: "fail", message: `Output does not match pattern /${pattern}/${flags ?? ""}` };
    } catch {
      return { result: "error", message: `Invalid regex pattern: ${pattern}` };
    }
  }
}
