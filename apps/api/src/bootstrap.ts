import { ENGINE_DEFAULT_DEPTH, OpenAiServiceTierSchema, ReasoningEffortSchema } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { JobQueue } from './jobs/queue.js';
import type { GatewayConfig } from './llm/gateway.js';
import { DEFAULT_MODEL_TUNING, type ModelTuning } from './llm/model-options.js';
import type { KeyVault } from './llm/key-vault.js';
import type { CoachAgentDependencies } from './services/coach-agent.js';
import type { TtsConfig } from './services/tts.js';
import type { EngineTunnelTransport } from './services/engine/engine-tunnel-transport.js';
import { LichessEvalIndex, LichessEvalIndexFormatError } from './services/engine/lichess-eval-index.js';
import type { ResolveEngineBackendOptions } from './services/engine/resolve-engine-backend.js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Reads the env vars the LLM gateway needs. The app is BYOK-only — users
 * supply their own Anthropic/OpenAI API key (stored encrypted in
 * user_llm_keys), so there are no platform keys here, only the per-tier model
 * ids. `LLM_FAKE=1` (Task 7.2 smoke-test mode) short-circuits every model call
 * in getModelForUser — see llm/gateway.ts. */
export function buildGatewayConfigFromEnv(keyVault: KeyVault): GatewayConfig {
  return {
    keyVault,
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
  /** Optional test-only override, carried through from CoachAgentDependencies
   * so sessions.test.ts can still inject a MockLanguageModelV4 via the base
   * deps — production callers never set this. */
  resolveModel?: CoachAgentDependencies['resolveModel'];
}

/** Everything CoachAgentDependencies needs except analyzePosition and
 * callLightModel, both of which are resolved per-request against the
 * specific user (design spec §3 / BYOK) — see routes/sessions.ts's
 * buildRequestScopedAgentDeps. */
export function buildCoachAgentBaseDependencies(
  db: Kysely<Database>,
  jobQueue: JobQueue,
  gatewayConfig: GatewayConfig
): CoachAgentBaseDependencies {
  return {
    db,
    jobQueue,
    gatewayConfig
  };
}

const DEFAULT_TTS_MODEL_OPENAI = 'gpt-4o-mini-tts';

/** The OpenAI TTS model id only — the API key itself is resolved per-request
 * from the user's BYOK OpenAI key (see routes/tts.ts), since the app is
 * bring-your-own-key only. TTS_MODEL_OPENAI defaults to 'gpt-4o-mini-tts'
 * (cheaper and more expressive than 'tts-1'); it must never be a hard
 * requirement that can crash the whole API process. */
export function buildTtsConfigFromEnv(): TtsConfig | undefined {
  return {
    modelId: process.env.TTS_MODEL_OPENAI ?? DEFAULT_TTS_MODEL_OPENAI
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
 * crash-loop the api/worker pods. A `LichessEvalIndexFormatError` (the file's
 * v2 magic header doesn't match — most likely a stale v1-format file still on
 * disk after this code deployed ahead of a rebuilt index) is treated the same
 * way: skip the tier with a warning rather than crash-loop, since the safe
 * rollout order for a format change is "code first" (see
 * apps/api/data/README.md). Any other error (e.g. a corrupt/wrong-size file
 * that does have a valid header) still throws, since that indicates a real
 * problem worth surfacing loudly. */
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
    if (error instanceof LichessEvalIndexFormatError) {
      console.warn(
        `LICHESS_EVAL_INDEX_PATH is set to "${filePath}" but it isn't a v2-format index yet (${error.message}) — skipping the Lichess eval tier until it's rebuilt.`
      );
      return null;
    }
    throw error;
  }
}

