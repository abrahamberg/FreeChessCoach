import { COACH_NUDGE_STALE_DAYS, type CoachNudge } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import { getCoachingCandidate } from './coaching-candidate.js';
import { getDiagnosticReadiness } from './diagnostic-readiness.js';
import { toListItem } from './games.js';

/** How many recent uncoached games the offered one is picked from — the
 * size of a typical import batch. */
const OFFER_POOL_SIZE = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /api/users/me/coach-nudge: which situation the student is in (see
 * CoachNudgeSchema for the order), plus the practice set or game to offer. */
export async function getCoachNudge(db: Kysely<Database>, userId: string, now: Date = new Date()): Promise<CoachNudge> {
  const openAssignments = await puzzleAssignmentsRepo.listOpenForUser(db, userId);
  const practice = openAssignments[0];
  if (practice) return { kind: 'practice', assignmentId: practice.id };

  const [readiness, imports] = await Promise.all([
    getDiagnosticReadiness(db, userId),
    gamesRepo.importStatsForUser(db, userId)
  ]);
  // A new student: still short of the games pattern tracking needs. Someone
  // with plenty of imports that just aren't rated / one time control moves
  // on, rather than hearing "import more" forever.
  if (!readiness.ready && imports.count < readiness.required) {
    return { kind: 'import_first', ratedGames: readiness.ratedGames, required: readiness.required };
  }

  const [lastCoachedAt, lastPlayedAt] = await Promise.all([
    sessionsRepo.latestStartedAtForUser(db, userId, 'analyze'),
    sessionsRepo.latestStartedAtForUser(db, userId, 'play')
  ]);
  const offered = await offerGame(db, userId);
  if (lastCoachedAt === null && offered) return { kind: 'first_coaching', game: offered };
  if (lastPlayedAt === null) return { kind: 'first_play' };

  const isStale = (at: Date | null) => at === null || now.getTime() - at.getTime() > COACH_NUDGE_STALE_DAYS * DAY_MS;
  if (isStale(imports.lastImportedAt)) return { kind: 'import_more' };
  if (isStale(lastCoachedAt) && offered) return { kind: 'coach_game', game: offered };
  if (isStale(lastPlayedAt)) return { kind: 'play_coach' };
  return { kind: 'idle' };
}

/** The game the coach offers: among the newest uncoached analyzed imports,
 * the one bulk import would recommend (most tactics missed and allowed),
 * else simply the newest. */
async function offerGame(db: Kysely<Database>, userId: string) {
  const rows = await gamesRepo.listRecentUncoachedReady(db, userId, OFFER_POOL_SIZE);
  if (rows.length === 0) return null;
  const { candidate } = await getCoachingCandidate(
    db,
    userId,
    rows.map((row) => row.id)
  );
  const row = rows.find((candidateRow) => candidateRow.id === candidate?.gameId) ?? rows[0]!;
  return toListItem(db, userId, row);
}
