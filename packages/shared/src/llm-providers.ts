import { z } from 'zod';

/** Cloud providers the setup form knows by name: their API URL is fixed and
 * their model list can be fetched with the user's key. `other` (Azure,
 * Bedrock gateways, self-hosted proxies, …) is typed in by hand. */
export const CloudProviderSchema = z.enum(['openai', 'anthropic', 'openrouter', 'other']);
export type CloudProvider = z.infer<typeof CloudProviderSchema>;
export type KnownCloudProvider = Exclude<CloudProvider, 'other'>;

export const KnownCloudProviderSchema = z.enum(['openai', 'anthropic', 'openrouter']);

export interface CloudProviderPreset {
  label: string;
  endpoint: string;
  /** The coach's model. */
  highModel: string;
  /** Summaries and other light work. */
  lowModel: string;
  /** Cloud voice; only OpenAI offers it. */
  voiceModel: string | null;
  /** OpenAI's flex service tier; no other provider has one. */
  supportsFlex: boolean;
}

export const CLOUD_PROVIDER_PRESETS: Record<KnownCloudProvider, CloudProviderPreset> = {
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    highModel: 'gpt-6-sol',
    lowModel: 'gpt-6-luna',
    voiceModel: 'gpt-4o-mini-tts',
    supportsFlex: true
  },
  anthropic: {
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    highModel: 'claude-sonnet-5',
    lowModel: 'claude-haiku-4-5-20251001',
    voiceModel: null,
    supportsFlex: false
  },
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    highModel: 'openai/gpt-6-sol',
    lowModel: 'openai/gpt-6-luna',
    voiceModel: null,
    supportsFlex: false
  }
};

const PROVIDER_HOSTS: Record<string, KnownCloudProvider> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'openrouter.ai': 'openrouter'
};

/** Which named provider an endpoint belongs to, by exact host. Anything else
 * (including a malformed URL) is `other`. */
export function cloudProviderOf(endpoint: string | undefined): CloudProvider {
  if (!endpoint) return 'other';
  try {
    return PROVIDER_HOSTS[new URL(endpoint).hostname] ?? 'other';
  } catch {
    return 'other';
  }
}

/** Body of POST /api/users/me/llm-setup/cloud-models. Without `apiKey` the
 * saved (unlocked) setup's key is used, and only if that setup is on the
 * same provider — a key is never sent to a host it wasn't saved for. */
export const CloudModelsRequestSchema = z.object({
  provider: KnownCloudProviderSchema,
  apiKey: z.string().trim().min(1).max(4096).optional()
});
export type CloudModelsRequest = z.infer<typeof CloudModelsRequestSchema>;

export const CloudModelsResponseSchema = z.object({
  /** Text models, sorted. Empty when the key was rejected. */
  models: z.array(z.string()),
  /** Text-to-speech models (OpenAI only). */
  voiceModels: z.array(z.string()),
  error: z.string().optional()
});
export type CloudModelsResponse = z.infer<typeof CloudModelsResponseSchema>;
