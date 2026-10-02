import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

/**
 * The one place that decides whether a mate count is said (Task 125.6,
 * `docs/tactics-rework.md` §13). A search proves a mate long before it finds
 * the shortest one: the owner's 24…Qxh3 read "They forced mate in 10" off a
 * depth-12 search with mate in 5 on the board. So a count read off an engine
 * line is said only when the search behind it can stand behind it, and the
 * mate is short enough to be worth a number (`CONFIG.mateCount`, with the
 * measurement). Every sentence with a mate count asks here: the tactic cards
 * (`move-verdict/mate-distance.ts`), "Missed mate in N" (`move-reasons.ts`),
 * the dossier's verdict words (`board-facts/verdict-words.ts`) and its
 * tempting moves (`course/tempting.ts`). Without a count the sentence still
 * says there is a forced mate.
 *
 * `searched` is the eval the line belongs to: the mate's length in plies
 * depends on who is to move there, and what the search covers on its depth.
 * Returns the count in moves, or null.
 */
export function saidMateIn(line: Pick<EngineLine, 'mateIn'>, searched: Pick<EngineEval, 'fen' | 'depth'>): number | null {
  if (line.mateIn === null || line.mateIn === 0) return null;
  const moves = Math.abs(line.mateIn);
  const { maxMoves, provenPlies, deepDepth } = CONFIG.mateCount;
  if (moves > maxMoves) return null;
  return matePlies(line.mateIn, searched.fen) <= provenPlies || searched.depth >= deepDepth ? moves : null;
}

/** Plies to the mate from the searched position: the side to move mating in
 * N plays N moves and answers N - 1; being mated in N it plays N more. */
function matePlies(mateIn: number, fen: string): number {
  const moverMates = mateIn > 0 === (fen.split(' ')[1] !== 'b');
  return 2 * Math.abs(mateIn) - (moverMates ? 1 : 0);
}
