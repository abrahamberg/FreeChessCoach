import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { providerEndpointOptions } from './provider-fetch.js';

/** Builds either standard OpenAI Chat Completions or Responses transport. The
 * compatibility probe chooses the format that the user's endpoint accepts. */
export function openaiModel(
  apiKey: string,
  modelId: string,
  endpoint: string,
  protocol: 'openai-chat' | 'openai-responses'
): LanguageModel {
  // `api-key` covers Azure OpenAI; bearer auth is the normal OpenAI-compatible
  // convention and remains the primary header for OpenRouter and other proxies.
  const provider = createOpenAI({
    apiKey,
    ...providerEndpointOptions(endpoint),
    headers: { 'api-key': apiKey },
  });
  return protocol === 'openai-responses' ? provider.responses(modelId) : provider.chat(modelId);
}
