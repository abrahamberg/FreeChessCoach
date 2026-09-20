import { createClient } from 'redis';
import { withDeadline } from '../../lib/with-deadline.js';
import { EngineEvalSchema, type EngineEval, type PositionAnalysis } from '@freechesscoach/shared';
import { devLog } from '../../lib/dev-log.js';
import { toEngineEval } from '../play-move-quality.js';

/** Event type for `DEBUG_LOG` (lib/dev-log.ts): why a background rating eval
 * produced nothing — most often no browser tab is connected for the light
 * engine, which is expected and must not be noisy. */
export const RATING_EVAL_LOG_TYPE = 'bot_rating';

/**
 * Where the light engine's evals of "the position the student is about to move
 * from" wait until that move is rated (bot-turn-rating.ts). The API runs as
 * several pods and the student's next move can land on a different one than
 * the reply that scheduled the eval, so production keeps these in Redis
 * (`createRedisRatingEvalStore`); the process-local store is for tests and a
 * local run without REDIS_URL.
 *
 * Deliberately NOT the position_evaluations cache: that table is keyed by
 * position alone and trusts whatever depth it holds, so a shallow light-engine
 * row there would silently replace standard-depth evals in game review. Both
 * calls never reject: a lost or unreachable entry just leaves one live label
 * unrated, and post-game analysis rates every move properly anyway.
 */
export interface RatingEvalStore {
  get(fen: string): Promise<EngineEval | undefined>;
  set(fen: string, value: EngineEval): Promise<void>;
}

export const DEFAULT_RATING_EVAL_LIMIT = 500;
/** Long enough to cover a student thinking about their move, short enough that
 * abandoned games do not leave entries behind. */
export const RATING_EVAL_TTL_SECONDS = 3600;
/** A rating waits at most this long for Redis — a live label is never worth
 * holding the bot's reply. */
export const RATING_EVAL_REDIS_TIMEOUT_MS = 500;

export function createMemoryRatingEvalStore(limit = DEFAULT_RATING_EVAL_LIMIT): RatingEvalStore {
  const evals = new Map<string, EngineEval>();
  return {
    async get(fen) {
      return evals.get(fen);
    },
    async set(fen, value) {
      evals.delete(fen);
      evals.set(fen, value);
      // Maps iterate in insertion order, so the first key is the oldest.
      while (evals.size > limit) evals.delete(evals.keys().next().value as string);
    }
  };
}

export function createRedisRatingEvalStore(redisUrl: string, timeoutMs = RATING_EVAL_REDIS_TIMEOUT_MS): RatingEvalStore {
  const client = createClient({ url: redisUrl });
  client.on('error', (error) => console.error('Rating eval Redis error', error));
  const connected = client.connect();
  const keyFor = (fen: string) => `rating-eval:${fen}`;

  return {
    async get(fen) {
      const value = await withDeadline('rating eval store', async () => {
        await connected;
        return client.get(keyFor(fen));
      }, timeoutMs);
      if (!value) return undefined;
      // A corrupt or foreign entry is "no eval", never a failed turn.
      try {
        const parsed = EngineEvalSchema.safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    },
    async set(fen, value) {
      await withDeadline('rating eval store', async () => {
        await connected;
        await client.set(keyFor(fen), JSON.stringify(value), { EX: RATING_EVAL_TTL_SECONDS });
      }, timeoutMs);
    }
  };
}

export interface RatingEvalDependencies {
  /** Omitted, nothing is evaluated and the student's moves stay unrated live. */
  ratingEvals?: RatingEvalStore;
  /** The light engine (browser tab) — never the real engine pipeline, which
   * decides the bot's moves and must not be slowed by labels. */
  analyzeLight?: (fen: string) => Promise<PositionAnalysis>;
}

/**
 * Starts, without waiting for it, the light-engine eval the NEXT turn's rating
 * of the student's move will read. Fire and forget: it never delays or fails
 * the turn, and a failure only means that next move is not rated live.
 */
export function scheduleRatingEval(deps: RatingEvalDependencies, fen: string): void {
  const { ratingEvals, analyzeLight } = deps;
  if (!ratingEvals || !analyzeLight) return;

  void (async () => {
    if (await ratingEvals.get(fen)) return;
    const analysis = await analyzeLight(fen);
    if (analysis.lines.length > 0) await ratingEvals.set(fen, toEngineEval(fen, analysis));
  })().catch((error: unknown) => devLog(RATING_EVAL_LOG_TYPE, { fen, error: error instanceof Error ? error.message : String(error) }));
}
