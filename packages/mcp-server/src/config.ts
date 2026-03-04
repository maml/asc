export interface Config {
  baseUrl: string;
  consumer: { apiKey: string; consumerId: string } | null;
  provider: { apiKey: string; providerId: string } | null;
}

export function loadConfig(): Config {
  const baseUrl = process.env["ASC_BASE_URL"];
  if (!baseUrl) {
    throw new Error("ASC_BASE_URL is required");
  }

  const consumerKey = process.env["ASC_CONSUMER_API_KEY"];
  const consumerId = process.env["ASC_CONSUMER_ID"];
  const providerKey = process.env["ASC_PROVIDER_API_KEY"];
  const providerId = process.env["ASC_PROVIDER_ID"];

  const consumer =
    consumerKey && consumerId
      ? { apiKey: consumerKey, consumerId }
      : null;

  const provider =
    providerKey && providerId
      ? { apiKey: providerKey, providerId }
      : null;

  if (!consumer && !provider) {
    console.warn(
      "Warning: No credentials configured. Set ASC_CONSUMER_API_KEY + ASC_CONSUMER_ID and/or ASC_PROVIDER_API_KEY + ASC_PROVIDER_ID."
    );
  }

  return { baseUrl, consumer, provider };
}
