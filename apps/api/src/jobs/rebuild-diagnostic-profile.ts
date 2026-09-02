import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import {
  buildDiagnosticProfile,
  evaluateGates,
  extractPgnMoveComments,
  type DiagnosticEntry,
  type FocusCandidate,
  type PreviousProfileEntry
} from '@freechesscoach/chess-analysis';
import type { MovePhase } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { GameRow } from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { gamePlayedAt, toGateWindowGame, windowByTimeControl } from '../services/diagnostic-window.js';
import { syncProgrammaticFocusAreas } from '../services/progress.js';

export interface RebuildDiagnosticProfileJobPayload {
  userId: string;
}

export interface RebuildDiagnosticProfileTaskOptions {
  db: Kysely<Database>;
}

/** No numeric rating on file yet (Task 51.5's `users.rating` is nullable) —
 * least-arbitrary neutral default until the user sets one, same practical-
 * default precedent as every other unfootnoted `CONFIG` constant. */
const DEFAULT_STUDENT_RATING = 1200;

function opponentRatingFor(game: GameRow): number | null {
  return game.userColor === 'white' ? game.blackElo : game.whiteElo;
}

/**
 * Reconstructs Task 55.3's aggregation input from Task 56.3's persisted
 * rows — the per-opportunity context (phase, clock, opening, opponent
 * rating) that `build-diagnostics.ts` deliberately left off `detail` (see
 * its own doc comment) because it's game-level, not observation-level, and
 * cheaper to join once here than duplicate onto every row at write time.
 * `complexity` has no existing per-ply primitive (`rating-estimate.ts`'s
 * `complexity` is a whole-game scalar, not a per-move one) — left `null`, a
 * documented gap rather than a new pure-analysis computation this
 * persistence task shouldn't be inventing.
 */
async function toDiagnosticEntries(
  db: Kysely<Database>,
  windowedGames: ReadonlyMap<string, GameRow>,
  observations: readonly diagnosticObservationsRepo.DiagnosticObservationRow[]
): Promise<DiagnosticEntry[]> {
  const relevant = observations.filter((row) => windowedGames.has(row.gameId));
  const gameIds = [...new Set(relevant.map((row) => row.gameId))];

  const phaseByGame = new Map<string, Map<number, MovePhase | null>>();
  const clockByGame = new Map<string, Map<number, number | null>>();
  for (const gameId of gameIds) {
    const moves = await analysesRepo.findClassifiedMovesByGameId(db, gameId);
    phaseByGame.set(gameId, new Map((moves ?? []).map((move) => [move.ply, move.phase ?? null])));

    const game = windowedGames.get(gameId);
    const comments = game ? extractPgnMoveComments(game.pgn) : [];
    clockByGame.set(gameId, new Map(comments.map((comment) => [comment.ply, comment.clockMs])));
  }

  return relevant
    .map((row): DiagnosticEntry | null => {
      const game = windowedGames.get(row.gameId);
      if (!game) return null;
      return {
        code: row.code,
        direction: row.direction,
        gameId: row.gameId,
        failed: row.failed,
        hwdl: row.hwdl,
        severity: row.severity,
        reachability: row.reachability,
        opening: game.eco,
        userColor: game.userColor,
        phase: phaseByGame.get(row.gameId)?.get(row.ply) ?? null,
        clockRemainingMs: clockByGame.get(row.gameId)?.get(row.ply) ?? null,
        complexity: null,
        opponentRating: opponentRatingFor(game),
        playedAt: gamePlayedAt(game)
      };
    })
    .filter((entry): entry is DiagnosticEntry => entry !== null);
}

function toPreviousProfile(row: diagnosticProfilesRepo.DiagnosticProfileRow | undefined): PreviousProfileEntry[] {
  if (!row) return [];
  return row.profile.map((entry) => ({
    code: entry.code,
    direction: entry.direction,
    historyStatus: entry.historyStatus,
    aboveThreshold: entry.confidence !== 'insufficient'
  }));
}

/**
 * Task 56.4 — the first place Phase 54/55's independent pure primitives get
 * chained together: `buildDiagnosticProfile` (Task 55.3) already calls
 * `computeBetaBinomial` (Task 55.1) internally per code, so this job's own
 * work is assembly, not statistics — group the user's own rated games by
 * exact time control (§4.2), reconstruct each surviving observation's
 * `DiagnosticEntry` context, and persist one profile per time control that
 * clears the window minimum.
 *
 * Task 57.3 adds the second chained step: `evaluateGates` per code (joined
 * with its own profile entry into a `FocusCandidate`, same shape Task 57.2's
 * coach tool builds on demand) feeds `syncProgrammaticFocusAreas`, which
 * runs Task 55.4's `selectFocus` and turns the result into real focus-area
 * rows. `cascadeCollapsedCount`/`decidedPositionIncidentCount` stay `0` here
 * too, same documented gap as Task 57.2: that per-incident bookkeeping from
 * `resolveEpisodes` (Task 54.3) is never persisted onto a
 * `diagnostic_observations` row, so DQ-09/DQ-11 structurally can't fire from
 * this reconstruction — every other gate evaluates against real data.
 *
 * An empty `entries` list for a time control that still clears the window
 * minimum is a correct output, not a bug (`buildDiagnosticProfile` returns
 * `[]`, and this plan's own standing constraint requires the system be
 * allowed to say "no confident diagnosis") — most often this just means the
 * included games predate Task 56.3 shipping detectors.
 */
export async function runRebuildDiagnosticProfileJob(db: Kysely<Database>, userId: string): Promise<void> {
  const games = await gamesRepo.listByUser(db, userId);
  const windows = windowByTimeControl(games);
  if (windows.size === 0) return;

  const user = await usersRepo.findById(db, userId);
  const studentRating = user?.rating ?? DEFAULT_STUDENT_RATING;

  const allPlayedAt = [...windows.values()].flatMap((bucket) => bucket.map((w) => w.playedAt));
  const earliestSince = allPlayedAt.reduce((min, playedAt) => (playedAt < min ? playedAt : min), allPlayedAt[0]!);
  const observations = await diagnosticObservationsRepo.listForUserSince(db, userId, earliestSince);

  for (const [timeControl, bucket] of windows) {
    const windowedGames = new Map(bucket.map((w) => [w.game.id, w.game]));
    const entries = await toDiagnosticEntries(db, windowedGames, observations);

    const previous = await diagnosticProfilesRepo.latestProfile(db, userId, timeControl);
    const profile = buildDiagnosticProfile({ entries, studentRating, previousProfile: toPreviousProfile(previous) });

    const byPlayedAt = [...bucket].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
    const windowStart = byPlayedAt[0]!.playedAt;
    const windowEnd = byPlayedAt[byPlayedAt.length - 1]!.playedAt;

    await diagnosticProfilesRepo.upsertProfile(db, userId, timeControl, windowStart, windowEnd, profile);

    const windowGames = bucket.map((w) => toGateWindowGame(w.game));
    const candidates: FocusCandidate[] = profile.map((entry) => ({
      profile: entry,
      firedGates: evaluateGates({
        games: windowGames,
        opportunities: entry.opportunities,
        meanReachability: entry.meanReachability,
        cascadeCollapsedCount: 0,
        decidedPositionIncidentCount: 0,
        totalIncidentCount: entry.opportunities,
        selectionBias: null
      })
    }));
    await syncProgrammaticFocusAreas(db, userId, candidates);
  }
}

/** graphile-worker Task wrapper — enqueued by `jobs/analyze-game.ts` once an
 * analysis reaches `'ready'`, the same chaining idiom used there for
 * `deepen-analysis`, and independently triggerable via
 * `JobQueue.enqueueRebuildDiagnosticProfile` (see `jobs/queue.ts`), the same
 * operator-triggered idiom `backfill-game-metadata` already established. */
export function createRebuildDiagnosticProfileTask(options: RebuildDiagnosticProfileTaskOptions): Task {
  return async (payload) => {
    const { userId } = payload as RebuildDiagnosticProfileJobPayload;
    await runRebuildDiagnosticProfileJob(options.db, userId);
  };
}
