import type { Kysely } from 'kysely';
import { DIAGNOSIS_CODES_BY_ID, type DiagnosisCodeId } from '@freechesscoach/shared';
import { selectPuzzles, type PuzzleRecord } from '@freechesscoach/chess-analysis';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import type { Database } from '../db/schema.js';

/** How many *new* assignments one call creates, across every code that
 * qualifies — a student with several `probable` diagnoses firing at once
 * from a single profile rebuild shouldn't get flooded with that many
 * separate practice sets in one go. A first-pass number, not derived from
 * anything; revisit once this ships and there's real usage to look at
 * (same "practical default, not measured" status as
 * rebuild-diagnostic-profile.ts's DEFAULT_STUDENT_RATING). */
const MAX_NEW_ASSIGNMENTS_PER_RUN = 3;

const DEFAULT_PUZZLE_COUNT = 5;

/** Student-facing copy for why this batch of puzzles was assigned, frozen
 * onto the assignment row at creation time (0028_puzzle_assignments.ts) so
 * a later catalog edit never rewrites an already-shown card's text. Built
 * from the catalog's own `diagnosis` sentence (what the pattern looks
 * like) rather than `label` alone (too terse to stand on its own on a
 * dashboard card) — falls back to the code itself if the catalog somehow
 * doesn't have an entry, so this never throws. */
function buildReason(code: DiagnosisCodeId): string {
  const entry = DIAGNOSIS_CODES_BY_ID.get(code);
  if (!entry) return `Practice puzzles for ${code}.`;
  return `Practice puzzles for ${entry.label.toLowerCase()}: ${entry.diagnosis}`;
}

function toAssignmentItems(records: readonly PuzzleRecord[]): puzzleAssignmentsRepo.PuzzleAssignmentItem[] {
  return records.map((record) => ({
    puzzleId: record.puzzleId,
    fen: record.fen,
    moves: record.moves,
    rating: record.rating,
    themes: record.themes,
    result: 'pending'
  }));
}

/**
 * Task 59.3 — after a diagnostic profile rebuild, hand a student real
 * practice material for each `probable`-or-better diagnosis (the top
 * emittable confidence tier — see `EMITTABLE_CONFIDENCE_LEVELS` in
 * `@freechesscoach/shared`) that doesn't already have an open assignment.
 * `pool` is `null` when `PUZZLE_POOL_PATH` isn't configured (Task 59.1's
 * `openPuzzlePoolFromEnv`) — this is a skip, not a crash, same "optional
 * data tier" contract as the Lichess eval index.
 *
 * A `selectPuzzles` call that returns nothing for a code/rating (pool has
 * no puzzles matching that code's themes, or none close enough in rating)
 * is also a skip: an assignment with zero items would be a broken practice
 * card, so we simply don't create one and leave that diagnosis for a later
 * rebuild once the pool has more coverage.
 */
export async function createPuzzleAssignmentsForProfile(
  db: Kysely<Database>,
  userId: string,
  profile: readonly DiagnosticProfileEntry[],
  pool: readonly PuzzleRecord[] | null,
  studentRating: number
): Promise<void> {
  if (!pool || pool.length === 0) return;

  let created = 0;
  for (const entry of profile) {
    if (created >= MAX_NEW_ASSIGNMENTS_PER_RUN) return;
    if (entry.confidence !== 'probable') continue;
    if (await puzzleAssignmentsRepo.hasOpenAssignment(db, userId, entry.code)) continue;

    const puzzles = selectPuzzles(pool, { code: entry.code, rating: studentRating, count: DEFAULT_PUZZLE_COUNT });
    if (puzzles.length === 0) continue;

    await puzzleAssignmentsRepo.insert(db, {
      userId,
      diagnosisCode: entry.code,
      reason: buildReason(entry.code),
      items: toAssignmentItems(puzzles)
    });
    created += 1;
  }
}
