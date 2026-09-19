import { pickCoachingCandidate, type CoachingCandidateGame } from '@freechesscoach/chess-analysis';
import { StoredGameReportSchema, type CoachingCandidateResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import type { Database } from '../db/schema.js';

/** A row whose stored report no longer parses is skipped, like the stats
 * dashboard does (services/stats-entry.ts) — old-shape reports have no
 * tactic counts to rank. */
function toCandidateGame(row: analysesRepo.StatsSourceRow): CoachingCandidateGame | null {
  const parsed = StoredGameReportSchema.safeParse(row.gameReport);
  if (!parsed.success) return null;
  return {
    gameId: row.gameId,
    tacticMotifs: parsed.data.players[row.userColor].tacticMotifs,
    playedAt: row.playedAt ?? row.createdAt
  };
}

/** The user's own analyzed game most worth a coaching session among
 * `gameIds` (a just-imported batch). Ids that are someone else's, not
 * analyzed yet, or failed are ignored. Programmatic — no LLM in this path. */
export async function getCoachingCandidate(
  db: Kysely<Database>,
  userId: string,
  gameIds: string[]
): Promise<CoachingCandidateResponse> {
  const rows = await analysesRepo.listReadyReportsForGames(db, userId, gameIds);
  const games = rows.map(toCandidateGame).filter((game): game is CoachingCandidateGame => game !== null);
  return { candidate: pickCoachingCandidate(games) };
}
