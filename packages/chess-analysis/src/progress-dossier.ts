/** What the measured play says about one habit, game by game. The coach reads
 * these in a progress round so a status change rests on what happened in the
 * student's games, not on what the student says they do. */

export interface DossierGame {
  gameId: string;
  /** When it was played (import time when the game has no date). */
  playedAt: Date;
  /** Analysed since the previous session ended. */
  isNew: boolean;
}

export interface DossierObservation {
  gameId: string;
  code: string;
  failed: boolean;
}

export interface HabitGameResult {
  gameId: string;
  isNew: boolean;
  /** How many times the situation for this habit came up in the game. */
  opportunities: number;
  failures: number;
}

const DEFAULT_RECENT_GAMES = 5;

/** The last `maxGames` games, oldest first. A game where the situation never
 * came up has `opportunities: 0` — it is "no chance", never a success.
 * `games` is newest first. */
export function habitResults(
  code: string,
  games: readonly DossierGame[],
  observations: readonly DossierObservation[],
  maxGames = DEFAULT_RECENT_GAMES
): HabitGameResult[] {
  return games
    .slice(0, maxGames)
    .map((game) => {
      const here = observations.filter((row) => row.gameId === game.gameId && row.code === code);
      return { gameId: game.gameId, isNew: game.isNew, opportunities: here.length, failures: here.filter((row) => row.failed).length };
    })
    .reverse();
}

/** A graduated habit failed in a game played after it graduated. A fact for
 * the coach to act on (reopen or not), not a verdict. */
export function hasComeBack(
  code: string,
  graduatedAt: Date,
  games: readonly DossierGame[],
  observations: readonly DossierObservation[]
): boolean {
  const gamesAfter = new Set(games.filter((game) => game.playedAt > graduatedAt).map((game) => game.gameId));
  return observations.some((row) => row.code === code && row.failed && gamesAfter.has(row.gameId));
}
