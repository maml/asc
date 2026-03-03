// Auth identity types and Fastify request augmentation.

import type { ProviderId, ConsumerId } from "../types/brand.js";
import type { ProviderOrg } from "../types/provider.js";
import type { ConsumerOrg } from "../types/consumer.js";

export type AuthIdentity =
  | { type: "provider"; id: ProviderId; entity: ProviderOrg }
  | { type: "consumer"; id: ConsumerId; entity: ConsumerOrg };

declare module "fastify" {
  interface FastifyRequest {
    identity?: AuthIdentity;
  }
}
