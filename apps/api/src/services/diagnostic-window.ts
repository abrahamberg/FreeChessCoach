import { CONFIG, type GateWindowGame } from '@freechesscoach/chess-analysis';
import type { GameRow } from '../db/repositories/games.js';

/** §4.2's window minimum ("start with 30 recent rated games") — reused
 * directly from the data-quality gate config rather than a second constant
 * for the same number. Shared by the profile rebuild job (Task 56.4) and the
 * `get_diagnostic_profile` coach tool (Task 57.2), so both window a user's
 * games identically. */
export const MIN_WINDOW_GAMES = CONFIG.dataQualityGates.minRatedGames;

/** §4.2's own upper bound ("expand to 60-100 games when relevant
 * opportunities are rare") collapsed to a fixed cap rather than the spec's
 * adaptive per-code expansion, which would need iterative re-querying per
 * code — a documented, deliberate simplification, same "known gap"
 * precedent as Task 55.4's curriculum-value exception. */
export const MAX_WINDOW_GAMES = 100;

export interface WindowedGame {
  game: GameRow;
  playedAt: Date;
}

export function gamePlayedAt(game: GameRow): Date {
  return game.playedAt ?? game.createdAt;
}

/** Groups a user's rated games by exact `time_control` (§4.2: never pool
 * across time controls, never collapse to the coarser `speed` band),
 * keeping only the most recent `MAX_WINDOW_GAMES` per group and dropping
 * any group that doesn't clear `MIN_WINDOW_GAMES` — there's nothing to
 * diagnose yet, and the system is allowed to say so by simply not producing
 * a window for that time control. */
export function windowByTimeControl(games: readonly GameRow[]): Map<string, WindowedGame[]> {
  const byTimeControl = new Map<string, WindowedGame[]>();
  for (const game of games) {
    if (game.rated !== true || !game.timeControl) continue;
    const bucket = byTimeControl.get(game.timeControl) ?? [];
    bucket.push({ game, playedAt: gamePlayedAt(game) });
    byTimeControl.set(game.timeControl, bucket);
  }

  const windows = new Map<string, WindowedGame[]>();
  for (const [timeControl, bucket] of byTimeControl) {
    const recent = [...bucket].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime()).slice(0, MAX_WINDOW_GAMES);
    if (recent.length >= MIN_WINDOW_GAMES) windows.set(timeControl, recent);
  }
  return windows;
}

/** Maps one game row to `evaluate-gates.ts`'s `GateWindowGame` — the user's
 * own rating/side-relative fields (`ratingAtGame`, `opponentName`) are
 * picked by `userColor`, and `hasReliableClockData` reads whether any move
 * in the stored PGN carries a parsed clock reading (Task 51.1's
 * `moveTimes`), the same signal `rebuild-diagnostic-profile.ts` already
 * relies on for per-ply clock context. */
export function toGateWindowGame(game: GameRow): GateWindowGame {
  return {
    gameId: game.id,
    timeControl: game.timeControl ?? '',
    rated: game.rated,
    variant: game.variant,
    termination: game.termination,
    userColor: game.userColor,
    opening: game.eco,
    opponentName: game.userColor === 'white' ? game.blackName : game.whiteName,
    ratingAtGame: game.userColor === 'white' ? game.whiteElo : game.blackElo,
    ratingProvisional: game.ratingsProvisional,
    hasReliableClockData: game.moveTimes?.some((comment) => comment.clockMs !== null) ?? false
  };
}
