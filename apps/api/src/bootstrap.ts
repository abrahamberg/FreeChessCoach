import { ENGINE_DEFAULT_DEPTH, OpenAiServiceTierSchema, ReasoningEffortSchema } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { JobQueue } from './jobs/queue.js';
import { buildModel, resolveCallOptions, type GatewayConfig, type ModelResolution } from './llm/gateway.js';
import { buildFakeModel } from './llm/fake.js';
import { DEFAULT_MODEL_TUNING, type ModelTuning } from './llm/model-options.js';
import { generateProse } from './llm/text.js';
import type { KeyVault } from './llm/key-vault.js';
import type { CoachAgentDependencies } from './services/coach-agent.js';
import { createStripeClient, type StripeClient } from './services/stripe.js';
import type { TtsConfig } from './services/tts.js';
import type { EngineTunnelTransport } from './services/engine/engine-tunnel-transport.js';
import { LichessEvalIndex } from './services/engine/lichess-eval-index.js';
import type { ResolveEngineBackendOptions } from './services/engine/resolve-engine-backend.js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Reads the env vars architecture §8 defines for the LLM gateway. Platform
 * keys are optional (a deployment can run BYOK-only), model ids are required.
 * `LLM_FAKE=1` (Task 7.2 smoke-test mode) short-circuits every model call in
 * getModelForUser — see llm/gateway.ts. */
export function buildGatewayConfigFromEnv(keyVault: KeyVault): GatewayConfig {
  return {
    keyVault,
    platformKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY
    },
    modelIds: {
      standard: {
        anthropic: requireEnv('LLM_STANDARD_MODEL_ANTHROPIC'),
        openai: requireEnv('LLM_STANDARD_MODEL_OPENAI')
      },
      light: {
        anthropic: requireEnv('LLM_LIGHT_MODEL_ANTHROPIC'),
        openai: requireEnv('LLM_LIGHT_MODEL_OPENAI')
      }
    },
    tuning: buildModelTuningFromEnv(),
    fake: process.env.LLM_FAKE === '1'
  };
}

/** How each tier is called. All optional with working defaults — a deployment
 * that sets none of these gets `medium` reasoning on the coach, none on light
 * subagents, and OpenAI's normal service tier. Bad values fail here at boot
 * rather than as an opaque 400 from the provider on the first real turn. */
export function buildModelTuningFromEnv(): ModelTuning {
  return {
    reasoning: {
      standard: parseEnum(ReasoningEffortSchema, 'LLM_REASONING_STANDARD', DEFAULT_MODEL_TUNING.reasoning.standard),
      light: parseEnum(ReasoningEffortSchema, 'LLM_REASONING_LIGHT', DEFAULT_MODEL_TUNING.reasoning.light)
    },
    // `flex` is roughly half price but slower and can be refused under load —
    // off by default, flipped on per-deployment.
    openaiServiceTier: parseEnum(
      OpenAiServiceTierSchema,
      'LLM_OPENAI_SERVICE_TIER',
      DEFAULT_MODEL_TUNING.openaiServiceTier
    ),
    streamTimeouts: {
      firstChunkMs: parsePositiveInt('LLM_STREAM_FIRST_CHUNK_TIMEOUT_MS', DEFAULT_MODEL_TUNING.streamTimeouts.firstChunkMs),
      chunkMs: parsePositiveInt('LLM_STREAM_CHUNK_TIMEOUT_MS', DEFAULT_MODEL_TUNING.streamTimeouts.chunkMs)
    }
  };
}

function parseEnum<T extends string>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, name: string, fallback: T): T {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return parsed.data;
}

export function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

export interface CoachAgentBaseDependencies {
  db: Kysely<Database>;
  jobQueue: JobQueue;
  gatewayConfig: GatewayConfig;
  callLightModel: CoachAgentDependencies['callLightModel'];
  /** Optional test-only override, carried through from CoachAgentDependencies
   * so sessions.test.ts can still inject a MockLanguageModelV4 via the base
   * deps — production callers never set this. */
  resolveModel?: CoachAgentDependencies['resolveModel'];
}

/** Everything CoachAgentDependencies needs except analyzePosition, which
 * must be resolved per-request against the specific user (design spec §3) —
 * see routes/sessions.ts's buildRequestScopedAgentDeps. */
export function buildCoachAgentBaseDependencies(
  db: Kysely<Database>,
  jobQueue: JobQueue,
  gatewayConfig: GatewayConfig
): CoachAgentBaseDependencies {
  const lightResolution = buildLightResolution(gatewayConfig);

  return {
    db,
    jobQueue,
    gatewayConfig,
    callLightModel: async (messages) => {
      const result = await generateProse({
        resolution: lightResolution,
        system: messages.system,
        prompt: messages.user
      });
      return result.text;
    }
  };
}

/** Optional: only wired when STRIPE_SECRET_KEY is set (Task 8.1), the same way
 * platform LLM keys are optional — local/dev docker-compose runs fine with no
 * Stripe configured at all, and /api/credits/checkout + /api/stripe/webhook
 * simply don't register (see app.ts). Once secretKey is set, the rest of the
 * STRIPE_* vars are required together. */
export function buildStripeClientFromEnv(): StripeClient | undefined {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return undefined;

  return createStripeClient({
    secretKey,
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
    priceIds: {
      small: requireEnv('STRIPE_PRICE_SMALL'),
      medium: requireEnv('STRIPE_PRICE_MEDIUM'),
      large: requireEnv('STRIPE_PRICE_LARGE')
    },
    successUrl: requireEnv('STRIPE_CHECKOUT_SUCCESS_URL'),
    cancelUrl: requireEnv('STRIPE_CHECKOUT_CANCEL_URL')
  });
}

const DEFAULT_TTS_MODEL_OPENAI = 'gpt-4o-mini-tts';

/** Optional: only wired when OPENAI_API_KEY is set, the same "missing key,
 * the route simply doesn't register" pattern as Stripe
 * (buildStripeClientFromEnv) — a deployment with no OpenAI key just doesn't
 * offer the OpenAI TTS backend. Unlike the LLM gateway's model ids
 * (LLM_STANDARD_MODEL_OPENAI etc., which are required with no default —
 * getting those wrong is expensive and provider-specific), TTS_MODEL_OPENAI
 * defaults to 'gpt-4o-mini-tts' (cheaper and more expressive than 'tts-1',
 * and the model this app's persona voices in services/tts.ts were chosen
 * against) and only needs overriding to pick a different voice model; it
 * must never be a hard requirement that can crash the whole API process
 * just because OPENAI_API_KEY happens to be set for the (unrelated) LLM
 * gateway. TTS_OPENAI_CREDITS_PER_1K_CHARS has a working default too. */
export function buildTtsConfigFromEnv(): TtsConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  return {
    apiKey,
    modelId: process.env.TTS_MODEL_OPENAI ?? DEFAULT_TTS_MODEL_OPENAI,
    creditsPer1kChars: parsePositiveInt('TTS_OPENAI_CREDITS_PER_1K_CHARS', 5)
  };
}

/** Reads ENGINE_TUNNEL_TIMEOUT_MS (design spec §2 self-review fix — every
 * other numeric config value here is env-configurable, this one was missing
 * one). Default matches native's rough per-position ceiling.
 *
 * CHESS_API_TIMEOUT_MS bounds a single call to the third-party
 * https://chess-api.com/v1 API (chess-api-engine-backend.ts) — no API key or
 * other config needed, it's a free, keyless endpoint, so unlike Stripe/TTS
 * below there's no "feature absent when unconfigured" case to handle.
 *
 * CHESS_API_REQUEST_DELAY_MS paces analyzeGame's sequential per-position
 * calls to chess-api.com — an undocumented free API with no published rate
 * limit, where a malformed-but-200 response has so far only been observed
 * mid-way through an unpaced back-to-back run (chess-api-engine-backend.ts's
 * MALFORMED_RESPONSE_RETRY_DELAYS_MS handles the case where pacing alone
 * isn't enough). */
/**
 * `lichessEvalIndex` is opened once at process start — see
 * openLichessEvalIndexFromEnv — and threaded through here rather than
 * opened by this function, which stays synchronous so its existing
 * env-parsing tests don't need to become async.
 *
 * LICHESS_EVAL_MIN_DEPTH floors how deep a Lichess index hit must be before
 * it's trusted in place of a fresh engine call — defaults to
 * ENGINE_DEFAULT_DEPTH, the same depth every other backend targets, so a
 * hit never silently under-delivers relative to what a live call would have
 * produced.
 */
export function buildResolveEngineBackendOptions(
  db: Kysely<Database>,
  engineUrl: string,
  tunnelTransport: EngineTunnelTransport,
  lichessEvalIndex: LichessEvalIndex | null
): ResolveEngineBackendOptions {
  return {
    db,
    engineUrl,
    tunnelTransport,
    tunnelTimeoutMs: parsePositiveInt('ENGINE_TUNNEL_TIMEOUT_MS', 10000),
    chessApiTimeoutMs: parsePositiveInt('CHESS_API_TIMEOUT_MS', 15000),
    chessApiRequestDelayMs: parsePositiveInt('CHESS_API_REQUEST_DELAY_MS', 100),
    lichessEvalIndex,
    lichessEvalMinDepth: parsePositiveInt('LICHESS_EVAL_MIN_DEPTH', ENGINE_DEFAULT_DEPTH)
  };
}

/** Opens the pre-built Lichess evaluation index (see
 * services/engine/lichess-eval-index.ts and
 * scripts/build-lichess-eval-index.mts) when LICHESS_EVAL_INDEX_PATH is set,
 * once per process at startup — never per request/session, since opening
 * the file is the one part of this feature that's genuinely I/O, unlike the
 * read-only binary-search lookups against it. Returns null when unset, the
 * safe default for local dev and any deployment that hasn't provisioned the
 * index yet: resolveEngineBackend simply skips the Lichess tier in that case.
 *
 * A missing file at the configured path (ENOENT) also resolves to null rather
 * than throwing: the index lives on a PersistentVolumeClaim that's populated
 * out-of-band (apps/api/data/README.md), so `enabled: true` can legitimately
 * be applied before the file has actually been copied in — that shouldn't
 * crash-loop the api/worker pods. Any other error (e.g. a corrupt/wrong-size
 * file) still throws, since that indicates a real problem worth surfacing loudly. */
export async function openLichessEvalIndexFromEnv(): Promise<LichessEvalIndex | null> {
  const filePath = process.env.LICHESS_EVAL_INDEX_PATH;
  if (!filePath) return null;
  try {
    return await LichessEvalIndex.open(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(
        `LICHESS_EVAL_INDEX_PATH is set to "${filePath}" but no file exists there yet — skipping the Lichess eval tier until it's populated.`
      );
      return null;
    }
    throw error;
  }
}

/** The light model as a ModelResolution, so it carries the same reasoning and
 * provider tuning as a gateway-resolved one. `metered: false` because these
 * digests are not attributed to a specific user's BYOK — see the doc comment
 * on buildCoachAgentDependencies. */
function buildLightResolution(gatewayConfig: GatewayConfig): ModelResolution {
  if (gatewayConfig.fake) {
    return {
      model: buildFakeModel(),
      metered: false,
      provider: 'anthropic',
      modelId: 'llm-fake',
      callOptions: resolveCallOptions(gatewayConfig, 'anthropic', 'light')
    };
  }
  const provider = gatewayConfig.platformKeys.anthropic ? 'anthropic' : 'openai';
  const apiKey = gatewayConfig.platformKeys[provider];
  if (!apiKey) throw new Error('No platform LLM key configured (required for callLightModel)');
  const modelId = gatewayConfig.modelIds.light[provider];
  return {
    model: buildModel(provider, apiKey, modelId),
    metered: false,
    provider,
    modelId,
    callOptions: resolveCallOptions(gatewayConfig, provider, 'light')
  };
}

