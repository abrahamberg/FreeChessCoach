import type { Chess } from 'chess.js';
import { kingSquare, kingZone } from './squares.js';

/** The side to move's mating moves: chess.js marks them `#` in the SAN. */
export function matesInOne(board: Chess): string[] {
  return board.moves().filter((san) => san.endsWith('#'));
}

/** A forced mate in two that starts with a check: the check, the first
 * reply found, the mate. Checks only, so the search stays small: 12.Nfg5's
 * threat Nxf6+ Bxf6 Qxh7#. */
export function mateInTwoByCheck(board: Chess): string[] | null {
  for (const check of board.moves({ verbose: true }).filter((move) => move.san.endsWith('+'))) {
    board.move(check);
    const line = everyReplyMated(board);
    board.undo();
    if (line) return [check.san, ...line];
  }
  return null;
}

function everyReplyMated(board: Chess): string[] | null {
  const replies = board.moves({ verbose: true });
  if (replies.length === 0) return null;
  let shown: string[] | null = null;
  for (const reply of replies) {
    board.move(reply);
    const [mate] = matesInOne(board);
    board.undo();
    if (!mate) return null;
    shown ??= [reply.san, mate];
  }
  return shown;
}

/** The shortest mate the side to move has, one or two moves deep. The two-move
 * search runs only near a king that is short of room or under fire: two
 * pieces bearing on its squares, or no square to step to. */
export function mateThreat(board: Chess): string[] | null {
  const [mate] = matesInOne(board);
  if (mate) return [mate];
  return kingInDanger(board) ? mateInTwoByCheck(board) : null;
}

function kingInDanger(board: Chess): boolean {
  const attacker = board.turn();
  const defender = attacker === 'w' ? 'b' : 'w';
  const zone = kingZone(board, defender);
  const attackers = new Set(zone.flatMap((square) => board.attackers(square, attacker)));
  if (attackers.size >= 2) return true;
  const king = kingSquare(board, defender);
  return zone.filter((square) => square !== king).every((square) => board.get(square)?.color === defender || board.isAttacked(square, attacker));
}
