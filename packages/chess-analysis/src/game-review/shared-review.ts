import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { loadFirstGame } from '../pgn.js';

/** The headers a shared review keeps: who played, how it ended, and where
 * the game started from. Site, date, event, ratings and links go. */
const KEPT_HEADERS = new Set(['White', 'Black', 'Result', 'SetUp', 'FEN']);

/** Worst first: the verdicts a key moment may have. */
const MISTAKES = ['blunder', 'miss', 'mistake', 'inaccuracy'] as const;

/**
 * The game's PGN as a shared review link shows it (growth plan A6): the
 * mainline only, no comments or variations, and only the players' names,
 * the result and a set-up position as headers.
 */
export function sharedGamePgn(pgn: string): string {
  const chess = loadFirstGame(pgn);
  for (const key of Object.keys(chess.getHeaders())) {
    if (!KEPT_HEADERS.has(key)) chess.removeHeader(key);
  }
  return chess.pgn();
}

/**
 * The ply a shared review opens on and pictures: the reviewed side's worst
 * verdict, the costliest of those on ties, the earliest on equal cost. A
 * game with no mistake by that side opens on its last move.
 */
export function keyMomentPly(moves: readonly ClassifiedMoveDto[], side: 'white' | 'black'): number {
  for (const quality of MISTAKES) {
    const costliest = costliestMove(moves.filter((move) => move.mover === side && move.quality === quality));
    if (costliest) return costliest.ply;
  }
  return moves.at(-1)?.ply ?? 0;
}

function costliestMove(moves: readonly ClassifiedMoveDto[]): ClassifiedMoveDto | null {
  let best: ClassifiedMoveDto | null = null;
  for (const move of moves) {
    if (!best || move.cpLoss > best.cpLoss) best = move;
  }
  return best;
}
