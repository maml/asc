import { AscConsumer, AscProvider } from "@asc-so/client";
import type { ConsumerId, ProviderId } from "@asc-so/client";
import type { Config } from "./config.js";

export interface Clients {
  baseUrl: string;
  consumer: AscConsumer | null;
  provider: AscProvider | null;
}

export function buildClients(config: Config): Clients {
  const consumer = config.consumer
    ? new AscConsumer({
        baseUrl: config.baseUrl,
        apiKey: config.consumer.apiKey,
        consumerId: config.consumer.consumerId as ConsumerId,
      })
    : null;

  const provider = config.provider
    ? new AscProvider({
        baseUrl: config.baseUrl,
        apiKey: config.provider.apiKey,
        providerId: config.provider.providerId as ProviderId,
      })
    : null;

  return { baseUrl: config.baseUrl, consumer, provider };
}
