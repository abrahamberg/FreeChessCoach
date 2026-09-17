import { CoachingPlanSchema, ratingForPromptScoping } from '@freechesscoach/shared';
import type { CoachingPlan } from '@freechesscoach/shared';
import { buildPlannerMessages, type PlannerPromptInput } from '@freechesscoach/prompts';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { getModelForUser, type GatewayConfig } from '../llm/gateway.js';
import { generateStructured } from '../llm/text.js';
import { composeGameReport } from './game-report.js';
import { getPlayerStatsText } from './coach-player-stats.js';
import * as userProfileService from './user-profile.js';

/**
 * A game's coaching plan no longer comes free with import (services/analysis.ts's
 * `runAnalyzeGameJob` is purely mechanical now — no LLM call, no BYOK-unlock
 * dependency). It's generated here instead, the first time a user actually
 * starts a coaching session on this game — called from
 * `buildSystemPromptForSession`, which already requires the same unlock for
 * its own turn's model, so this introduces no new unlock-dependency moment.
 * Idempotent: every session after the first just reads the stored plan back.
 * Self-contained (its own fetches) rather than threaded from the caller —
 * this only runs once per game, so the small duplicate-query cost against
 * `buildSystemPromptForSession`'s own user/game fetches buys a clean,
 * independently testable function; no locking against a double-call race
 * (two tabs opening the same never-planned game's first turn at once) —
 * last-write-wins, same as `markReady` itself has always been.
 */
export async function ensureCoachingPlan(
  db: Kysely<Database>,
  gatewayConfig: GatewayConfig,
  gameId: string,
  userId: string
): Promise<CoachingPlan> {
  const existing = await analysesRepo.findCoachingPlanByGameId(db, gameId);
  if (existing) return existing;

  const [analysis, game, user] = await Promise.all([
    analysesRepo.findByGameId(db, gameId),
    gamesRepo.findById(db, gameId),
    usersRepo.findById(db, userId)
  ]);
  if (!analysis) throw new NotFoundError('Analysis not found');
  if (!game) throw new NotFoundError('Game not found');
  if (!user) throw new NotFoundError('User not found');

  const [storedReport, candidateMoments, profileSummary, playerStats] = await Promise.all([
    analysesRepo.findGameReportByGameId(db, gameId),
    analysesRepo.findCandidateMomentsByGameId(db, gameId),
    userProfileService.getProfileSummary(db, userId),
    getPlayerStatsText(db, { userId, gameId })
  ]);
  if (!storedReport) throw new NotFoundError('Game report not found');
  const gameReport = composeGameReport(storedReport, { annotatedPgn: game.annotatedPgn, userColor: game.userColor });

  const plannerInput: PlannerPromptInput = {
    band: user.ratingBand,
    rating: ratingForPromptScoping(user.rating, user.ratingBand),
    focusAreas: profileSummary.focusAreas,
    recentFindings: profileSummary.recentFindings,
    selfAssessment: user.selfAssessment,
    userColor: game.userColor,
    moves: gameReport.moves,
    candidateMoments: candidateMoments ?? [],
    playerStats
  };

  const resolution = await getModelForUser(db, gatewayConfig, userId, 'light');
  const messages = buildPlannerMessages(plannerInput);
  const result = await generateStructured({
    resolution,
    system: messages.system,
    prompt: messages.user,
    schema: CoachingPlanSchema
  });

  await analysesRepo.storeCoachingPlan(db, analysis.id, result.object);
  return result.object;
}
