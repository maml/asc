// Maps active tasks to edge animation state

export interface ActiveFlow {
  edgeId: string;
  color: string;
  startedAt: number;
}

export class AnimationEngine {
  private flows = new Map<string, ActiveFlow>();

  // When a task starts, activate the relevant edges
  startFlow(taskId: string, agentId: string, consumerEdgeId?: string): void {
    // Consumer -> Backend edge
    this.flows.set(`${taskId}-inbound`, {
      edgeId: consumerEdgeId ?? "e-consumer-backend",
      color: "var(--edge-active)",
      startedAt: Date.now(),
    });
    // Backend -> Agent edge
    const agentEdgeId = `e-backend-${agentId}`;
    this.flows.set(`${taskId}-outbound`, {
      edgeId: agentEdgeId,
      color: "var(--edge-active)",
      startedAt: Date.now(),
    });
  }

  completeFlow(taskId: string): void {
    // Brief green flash before removal
    const inbound = this.flows.get(`${taskId}-inbound`);
    const outbound = this.flows.get(`${taskId}-outbound`);
    if (inbound) inbound.color = "var(--edge-success)";
    if (outbound) outbound.color = "var(--edge-success)";

    setTimeout(() => {
      this.flows.delete(`${taskId}-inbound`);
      this.flows.delete(`${taskId}-outbound`);
    }, 600);
  }

  failFlow(taskId: string): void {
    const inbound = this.flows.get(`${taskId}-inbound`);
    const outbound = this.flows.get(`${taskId}-outbound`);
    if (inbound) inbound.color = "var(--edge-failure)";
    if (outbound) outbound.color = "var(--edge-failure)";

    setTimeout(() => {
      this.flows.delete(`${taskId}-inbound`);
      this.flows.delete(`${taskId}-outbound`);
    }, 600);
  }

  // Returns active edge IDs with their colors
  getActiveEdges(): Map<string, { color: string }> {
    const result = new Map<string, { color: string }>();
    for (const flow of this.flows.values()) {
      result.set(flow.edgeId, { color: flow.color });
    }
    return result;
  }

  clear(): void {
    this.flows.clear();
  }
}
