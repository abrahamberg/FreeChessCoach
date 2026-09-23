import type { LlmProtocol, LlmProvider, ReasoningEffort, StoredLlmSetup } from '@freechesscoach/shared';
import type { LanguageModel } from 'ai';
import type { Kysely } from 'kysely';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import type { LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { anthropicModel } from './anthropic.js';
import { buildFakeModel } from './fake.js';
import { createLocalModel } from './local-model.js';
import {
  callOptionsFor,
  DEFAULT_LOCAL_LLM_TIMEOUTS,
  DEFAULT_MODEL_TUNING,
  LOCAL_DEFAULT_REASONING,
  localStreamTimeouts,
  scaleTimeoutsForFlex,
  type LocalLlmTimeouts,
  type ModelCallOptions,
  type ModelTuning,
  type Tier
} from './model-options.js';
import { openaiModel } from './openai.js';
import type { LlmUnlockStore } from './unlock-store.js';

export type { Tier };

export interface GatewayConfig {
  unlockStore?: LlmUnlockStore;
  /** Reaches a local LLM (LM Studio / Ollama) through the user's browser tab.
   * Without it, a local setup fails with a clear error. */
  llmTunnelTransport?: LlmTunnelTransport;
  /** Time limits for local LLM calls; defaults when unset. */
  localLlm?: LocalLlmTimeouts;
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
  /** True when this call goes out on OpenAI's flex tier — slower, so callers
   * pass it to `streamTimeoutsFor` to avoid aborting a queued response. */
  usesFlex: boolean;
  /** True for a local LLM (LM Studio / Ollama) behind the browser tunnel —
   * also slow to start, see `streamTimeoutsFor`. */
  isLocal?: boolean;
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
      callOptions: resolveCallOptions(config, 'anthropic', tier),
      usesFlex: false
    };
  }

  if (!config.unlockStore) throw new ValidationError('Unlock storage is not configured.');
  const setup = await config.unlockStore.get(userId);
  if (!setup) {
    // unlockStore.get is just the short-lived cache — its being empty is
    // ambiguous between "never saved a setup" and "saved one, but the
    // unlock expired." The client branches on this message (see
    // useCoachChat.ts's readProblemDetailTitle handling) to send a
    // never-configured user to Settings instead of prompting them for a
    // passphrase they were never asked to set.
    const row = await llmSetupsRepo.findByUser(db, userId);
    if (!row) {
      throw new ValidationError('Set up your AI in Settings before coaching.');
    }
    throw new ValidationError('Unlock your AI setup in Settings with your unlock phrase before coaching.');
  }
  const protocol = resolveTierProtocol(setup, tier);
  const provider = providerForProtocol(protocol);
  const modelId = tier === 'standard' ? setup.highModel : setup.lowModel;
  const isLocal = protocol === 'local';
  const usesFlex = !isLocal && provider === 'openai' && setup.useFlex === true;
  const callOptions = resolveCallOptions(config, provider, tier, usesFlex, reasoningFor(setup, tier, isLocal));
  return {
    model: buildModel(config, setup, protocol, modelId, userId),
    provider,
    modelId,
    // A local server ignores OpenAI's provider options (service tier,
    // reasoning summary); only the portable `reasoning` reaches it.
    callOptions: isLocal ? { reasoning: callOptions.reasoning } : callOptions,
    usesFlex,
    isLocal
  };
}

export function resolveCallOptions(
  config: GatewayConfig,
  provider: LlmProvider,
  tier: Tier,
  useFlex = false,
  reasoningOverride?: ReasoningEffort
): ModelCallOptions {
  return callOptionsFor(config.tuning ?? DEFAULT_MODEL_TUNING, provider, tier, useFlex, reasoningOverride);
}

export function streamTimeoutsFor(
  config: GatewayConfig,
  resolution: Pick<ModelResolution, 'usesFlex' | 'isLocal'>
): ModelTuning['streamTimeouts'] {
  if (resolution.isLocal) return localStreamTimeouts(config.localLlm ?? DEFAULT_LOCAL_LLM_TIMEOUTS);
  return scaleTimeoutsForFlex((config.tuning ?? DEFAULT_MODEL_TUNING).streamTimeouts, resolution.usesFlex);
}

/** Each model's own detected format; setups saved before per-model
 * detection have one `protocol` for both. */
export function resolveTierProtocol(setup: StoredLlmSetup, tier: Tier): LlmProtocol {
  const own = tier === 'standard' ? setup.highProtocol : setup.lowProtocol;
  return own ?? setup.protocol;
}

/** The user's thinking level for this tier, else Off for a local model, else
 * undefined (the deployment's tuning decides). */
function reasoningFor(setup: StoredLlmSetup, tier: Tier, isLocal: boolean): ReasoningEffort | undefined {
  const chosen = setup.reasoning?.[tier];
  if (chosen) return chosen;
  return isLocal ? LOCAL_DEFAULT_REASONING : undefined;
}

export function buildModel(
  config: GatewayConfig,
  setup: StoredLlmSetup,
  protocol: LlmProtocol,
  modelId: string,
  userId: string
): LanguageModel {
  if (protocol === 'local') {
    if (!config.llmTunnelTransport) throw new ValidationError('Local AI is not available in this process.');
    return createLocalModel({
      transport: config.llmTunnelTransport,
      timeouts: config.localLlm ?? DEFAULT_LOCAL_LLM_TIMEOUTS,
      userId,
      modelId,
      baseUrl: setup.endpoint,
      token: setup.localToken
    });
  }
  if (!setup.apiKey) throw new ValidationError('Your AI setup has no API key. Replace it in Settings.');
  if (protocol === 'anthropic') return anthropicModel(setup.apiKey, modelId, setup.endpoint);
  return openaiModel(setup.apiKey, modelId, setup.endpoint, protocol);
}

// 'local' deliberately maps to 'openai': its OpenAI-compatible wire format
// takes the same reasoning-knob branch in resolveCallOptions. This makes
// ModelResolution.provider === 'openai' true for local sessions too — code
// that needs to know whether a resolution is actually local must check
// `isLocal`, not compare `provider`.
function providerForProtocol(protocol: LlmProtocol): LlmProvider {
  return protocol === 'anthropic' ? 'anthropic' : 'openai';
}
