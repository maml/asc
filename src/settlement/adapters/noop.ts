// NoopAdapter — used when no settlement network is configured.
// Records the settlement as successful without moving money.

import type {
  SettlementAdapter,
  SettlementRequest,
  SettlementResult,
  ProviderSettlementConfig,
} from "../../types/settlement.js";

export class NoopAdapter implements SettlementAdapter {
  async settle(request: SettlementRequest): Promise<SettlementResult> {
    return {
      status: "settled",
      externalId: `noop_${request.billingEventId}`,
      externalStatus: "completed",
      networkFeeCents: 0,
    };
  }

  async checkStatus(externalId: string): Promise<SettlementResult> {
    return {
      status: "settled",
      externalId,
      externalStatus: "completed",
      networkFeeCents: 0,
    };
  }

  async validateConfig(_config: ProviderSettlementConfig): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }
}
