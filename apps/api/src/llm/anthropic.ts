import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { providerEndpointOptions } from './provider-fetch.js';

export function anthropicModel(apiKey: string, modelId: string, endpoint: string): LanguageModel {
  return createAnthropic({
    authToken: apiKey,
    headers: { 'x-api-key': apiKey },
    ...providerEndpointOptions(endpoint)
  })(modelId);
}
