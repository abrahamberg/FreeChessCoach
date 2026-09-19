import type { Kysely } from 'kysely';
import * as diagnosticProfilesRepo from '../../src/db/repositories/diagnostic-profiles.js';
import * as findingsRepo from '../../src/db/repositories/findings.js';
import * as focusAreasRepo from '../../src/db/repositories/focus-areas.js';
import * as gamesRepo from '../../src/db/repositories/games.js';
import * as puzzleAssignmentsRepo from '../../src/db/repositories/puzzle-assignments.js';
import * as sessionMessagesRepo from '../../src/db/repositories/session-messages.js';
import * as sessionsRepo from '../../src/db/repositories/sessions.js';
import type { Database } from '../../src/db/schema.js';
import { openPuzzlePoolFromEnv } from '../../src/services/puzzle-pool.js';
import { createPuzzleAssignmentsForProfile } from '../../src/services/puzzle-assignment.js';
import { BEGINNER_FOCUS_AREAS, BEGINNER_PROFILE } from './beginner-diagnoses.js';
import { COACH_TRANSCRIPT, FEATURED_SUBJECT_PLY, toStoredContent } from './beginner-coach-session.js';
import { buildFindingSpecs, type LessonSpec } from './beginner-lessons.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PROFILE_TIME_CONTROL = '600+0';

/** The real analysis jobs also rebuild the profile and focus areas from the
 * handful of real games; clear that so the hand-written, six-weeks-in picture
 * is what the Progress page shows. Run this after those jobs have settled. */
export async function clearComputedProgress(db: Kysely<Database>, userId: string): Promise<void> {
  await diagnosticProfilesRepo.deleteByUserId(db, userId);
  await focusAreasRepo.deleteByUserId(db, userId);
  await findingsRepo.deleteByUserId(db, userId);
}

export async function seedFocusAreas(db: Kysely<Database>, userId: string): Promise<void> {
  for (const spec of BEGINNER_FOCUS_AREAS) {
    const row = await focusAreasRepo.insert(db, { userId, category: spec.category, diagnosisCode: spec.code, status: spec.status, note: spec.note });
    // Each update is one more piece of evidence, the way the app itself counts it.
    // The insert itself counts as the first piece of evidence.
    for (let i = 1; i < spec.evidence; i++) await focusAreasRepo.updateStatusAndNote(db, row.id, spec.status, spec.note);
    if (spec.isPrimary) await focusAreasRepo.setPrimary(db, row.id);
  }
}

export async function seedDiagnosticProfile(db: Kysely<Database>, userId: string, now: Date): Promise<void> {
  await diagnosticProfilesRepo.upsertProfile(db, userId, PROFILE_TIME_CONTROL, new Date(now.getTime() - 35 * MS_PER_DAY), now, BEGINNER_PROFILE);
}

/** Findings on the 20 most recent games (newest first), shaped so the trend chart
 * shows hanging pieces high but falling. */
export async function seedFindings(db: Kysely<Database>, userId: string, recentGameIdsNewestFirst: string[]): Promise<void> {
  for (const spec of buildFindingSpecs()) {
    const gameId = recentGameIdsNewestFirst[spec.gameFromNewest];
    if (!gameId) continue;
    await findingsRepo.insert(db, { userId, sessionId: null, gameId, category: spec.category, severity: spec.severity, ply: null, description: spec.description, isPositive: false });
  }
}

/** Real Lichess puzzles picked by the app's own selector for the strongest diagnoses. */
export async function seedPracticeSets(db: Kysely<Database>, userId: string, rating: number): Promise<void> {
  const pool = await openPuzzlePoolFromEnv();
  await createPuzzleAssignmentsForProfile(db, userId, BEGINNER_PROFILE, pool?.all() ?? null, rating);
  const open = await puzzleAssignmentsRepo.listOpenForUser(db, userId);
  console.log(`beginner: ${open.length} practice set(s)`);
}

export interface LessonGame {
  gameId: string;
  startedAt: Date;
}

/** A finished coaching session for one lesson, dated after the game it covers. */
export async function seedLesson(db: Kysely<Database>, userId: string, lesson: LessonSpec, game: LessonGame): Promise<string> {
  const session = await sessionsRepo.insert(db, { gameId: game.gameId, userId, startedAt: game.startedAt });
  await sessionsRepo.markCompleted(db, session.id);
  await sessionsRepo.storeSummary(db, session.id, lesson.summary, lesson.homework);
  await gamesRepo.updateReviewTier(db, game.gameId, 'coach');
  return session.id;
}

/** The conversation itself, for the one lesson that is opened in the screenshots. */
export async function seedFeaturedConversation(db: Kysely<Database>, sessionId: string): Promise<void> {
  for (const [index, entry] of COACH_TRANSCRIPT.entries()) {
    await sessionMessagesRepo.insert(db, sessionId, entry.role, toStoredContent(entry, index), entry.ply);
  }
  await sessionsRepo.updateSubjectAndCurrentPly(db, sessionId, FEATURED_SUBJECT_PLY);
}
