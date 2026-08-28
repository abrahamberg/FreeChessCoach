import { AnalyzePositionRequestSchema, HintMovesRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import {
  resolveEngineBackend,
  resolveRawEngineBackend,
  type ResolveEngineBackendOptions
} from '../services/engine/resolve-engine-backend.js';
import * as userProfileService from '../services/user-profile.js';

/** Shallower than a full analysis and multiPv > 1 (see
 * HintMovesRequestSchema's doc comment for why this can't share the cached
 * /analyze endpoint) — a hint's "3 reasonable moves" doesn't need
 * tournament-grade precision, and this runs synchronously in a request the
 * student is actively waiting on. */
const HINT_DEPTH = 12;
const HINT_MOVE_COUNT = 3;

/**
 * On-demand rich position analysis for the browser — resolves the requesting
 * user's own EngineBackend (native or browser-tunnel, per their engineMode),
 * wrapped in the same CachingEngineBackend the coach agent's
 * get_engine_analysis tool goes through (cache-first against
 * position_evaluations, live Stockfish on a miss). Available to any
 * authenticated user — backs the separate move-analysis inspector modal a
 * student opens explicitly.
 */
export function registerPositionAnalysisRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  engineBackendOptions: ResolveEngineBackendOptions
): void {
  app.post('/api/positions/analyze', async (request) => {
    const parsed = AnalyzePositionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    const backend = await resolveEngineBackend(engineBackendOptions, user.id);
    return backend.analyzePosition(parsed.data.fen);
  });

  // The bot session's hint feature, stage 2 — see HintMovesRequestSchema's
  // doc comment for why this is a separate, uncached endpoint rather than a
  // multiPv argument to /analyze above.
  app.post('/api/positions/hint-moves', async (request) => {
    const parsed = HintMovesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    const backend = await resolveRawEngineBackend(engineBackendOptions, user.id);
    const analysis = await backend.analyzePosition(parsed.data.fen, { depth: HINT_DEPTH, multiPv: HINT_MOVE_COUNT });
    return { lines: analysis.lines };
  });
}
