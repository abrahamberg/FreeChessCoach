import type { LlmProvider, StoredLlmSetup } from '@freechesscoach/shared';
import type { LanguageModel } from 'ai';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { anthropicModel } from './anthropic.js';
import { buildFakeModel } from './fake.js';
import { callOptionsFor, DEFAULT_MODEL_TUNING, type ModelCallOptions, type ModelTuning, type Tier } from './model-options.js';
import { openaiModel } from './openai.js';
import type { LlmUnlockStore } from './unlock-store.js';

export type { Tier };

export interface GatewayConfig {
  unlockStore?: LlmUnlockStore;
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

/** Resolves the model to use for a user's call from the setup currently held
 * in the short-lived unlock cache. The app is BYOK-only — if a user has no
 * active unlock, throws a ValidationError directing them to Settings. */
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

  if (!config.unlockStore) throw new ValidationError('Unlock storage is not configured.');
  const setup = await config.unlockStore.get(userId);
  if (!setup) {
    throw new ValidationError('Unlock your AI setup in Settings with your unlock phrase before coaching.');
  }
  const provider = providerForProtocol(setup.protocol);
  const modelId = tier === 'standard' ? setup.highModel : setup.lowModel;
  return {
    model: buildModel(setup, modelId),
    provider,
    modelId,
    callOptions: resolveCallOptions(config, provider, tier)
  };
}

export function resolveCallOptions(config: GatewayConfig, provider: LlmProvider, tier: Tier): ModelCallOptions {
  return callOptionsFor(config.tuning ?? DEFAULT_MODEL_TUNING, provider, tier);
}

export function streamTimeoutsFor(config: GatewayConfig): ModelTuning['streamTimeouts'] {
  return (config.tuning ?? DEFAULT_MODEL_TUNING).streamTimeouts;
}

export function buildModel(setup: StoredLlmSetup, modelId: string): LanguageModel {
  return setup.protocol === 'anthropic'
    ? anthropicModel(setup.apiKey, modelId, setup.endpoint)
    : openaiModel(setup.apiKey, modelId, setup.endpoint, setup.protocol);
}

function providerForProtocol(protocol: StoredLlmSetup['protocol']): LlmProvider {
  return protocol === 'anthropic' ? 'anthropic' : 'openai';
}
