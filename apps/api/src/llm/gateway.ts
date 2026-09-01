import type { LlmProvider } from '@freechesscoach/shared';
import type { LanguageModel } from 'ai';
import type { Kysely } from 'kysely';
import * as llmKeysRepo from '../db/repositories/llm-keys.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { anthropicModel } from './anthropic.js';
import { buildFakeModel } from './fake.js';
import { callOptionsFor, DEFAULT_MODEL_TUNING, type ModelCallOptions, type ModelTuning, type Tier } from './model-options.js';
import { openaiModel } from './openai.js';
import type { KeyVault } from './key-vault.js';

export type { Tier };

export interface GatewayConfig {
  keyVault: KeyVault;
  /** Per-tier, per-provider model ids (e.g. LLM_STANDARD_MODEL_ANTHROPIC). */
  modelIds: Record<Tier, Record<LlmProvider, string>>;
  /** How each tier is called (reasoning effort, OpenAI service tier, stream
   * timeouts) — see model-options.ts. Defaults when unset. */
  tuning?: ModelTuning;
  /** LLM_FAKE=1 local-dev/smoke-test mode — every getModelForUser call
   * returns a canned mock model stream, no keys or DB lookups. */
  fake?: boolean;
}

export interface ModelResolution {
  model: LanguageModel;
  provider: LlmProvider;
  modelId: string;
  /** Spread into the `streamText`/`generateText` call alongside the model. */
  callOptions: ModelCallOptions;
}

/** Resolves the model to use for a user's call: their BYOK key (Anthropic
 * preferred when both Anthropic and OpenAI are saved). The app is BYOK-only —
 * if a user has no saved key, throws a ValidationError directing them to
 * Settings, since there's no platform-key fallback to bill against anymore. */
export async function getModelForUser(
  db: Kysely<Database>,
  config: GatewayConfig,
  userId: string,
  tier: Tier
): Promise<ModelResolution> {
  if (config.fake) {
    return {
      model: buildFakeModel(),
      provider: 'anthropic',
      modelId: 'llm-fake',
      callOptions: resolveCallOptions(config, 'anthropic', tier)
    };
  }

  const byok = await resolveByokKey(db, config.keyVault, userId);
  if (!byok) {
    throw new ValidationError('Add your AI API key in Settings to start coaching — the app is bring-your-own-key only.');
  }
  const modelId = config.modelIds[tier][byok.provider];
  return {
    model: buildModel(byok.provider, byok.apiKey, modelId),
    provider: byok.provider,
    modelId,
    callOptions: resolveCallOptions(config, byok.provider, tier)
  };
}

export function resolveCallOptions(config: GatewayConfig, provider: LlmProvider, tier: Tier): ModelCallOptions {
  return callOptionsFor(config.tuning ?? DEFAULT_MODEL_TUNING, provider, tier);
}

export function streamTimeoutsFor(config: GatewayConfig): ModelTuning['streamTimeouts'] {
  return (config.tuning ?? DEFAULT_MODEL_TUNING).streamTimeouts;
}

async function resolveByokKey(
  db: Kysely<Database>,
  keyVault: KeyVault,
  userId: string
): Promise<{ provider: LlmProvider; apiKey: string } | null> {
  const keys = await llmKeysRepo.findAllByUser(db, userId);
  const preferred = keys.find((key) => key.provider === 'anthropic') ?? keys[0];
  if (!preferred) return null;
  const apiKey = keyVault.decrypt({ ciphertext: preferred.keyCiphertext, iv: preferred.keyIv });
  return { provider: preferred.provider, apiKey };
}

export function buildModel(provider: LlmProvider, apiKey: string, modelId: string): LanguageModel {
  return provider === 'anthropic' ? anthropicModel(apiKey, modelId) : openaiModel(apiKey, modelId);
}
