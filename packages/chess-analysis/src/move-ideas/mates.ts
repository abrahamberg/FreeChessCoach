import { Chess } from 'chess.js';
import { attackersOf, type FastBoard, type FastMove, KING_STEPS, squareOf, step, symbolOf } from '../fast-board/board.js';
import { isMate, legalMoves } from '../fast-board/moves.js';

/** The side to move's mating moves. The board is played on and given back. */
export function matesInOne(board: FastBoard): FastMove[] {
  const mates: FastMove[] = [];
  for (const move of legalMoves(board)) {
    board.make(move);
    if (isMate(board)) mates.push(move);
    board.unmake();
  }
  return mates;
}

/** A forced mate in two that starts with a check: the check, the first
 * reply found, the mate. Checks only, so the search stays small: 12.Nfg5's
 * threat Nxf6+ Bxf6 Qxh7#. */
function mateInTwoByCheck(board: FastBoard): FastMove[] | null {
  for (const check of legalMoves(board)) {
    board.make(check);
    const line = board.inCheck() ? everyReplyMated(board) : null;
    board.unmake();
    if (line) return [check, ...line];
  }
  return null;
}

function everyReplyMated(board: FastBoard): FastMove[] | null {
  const replies = legalMoves(board);
  if (replies.length === 0) return null;
  let shown: FastMove[] | null = null;
  for (const reply of replies) {
    board.make(reply);
    const [mate] = matesInOne(board);
    board.unmake();
    if (!mate) return null;
    shown ??= [reply, mate];
  }
  return shown;
}

/** The shortest mate the side to move has, one or two moves deep, in SAN.
 * The two-move search runs only near a king that is short of room or under
 * fire: two pieces bearing on its squares, or no square to step to. */
export function mateThreat(board: FastBoard): string[] | null {
  const [mate] = matesInOne(board);
  const line = mate ? [mate] : kingInDanger(board) ? mateInTwoByCheck(board) : null;
  return line ? sanLine(board.toFen(), line) : null;
}

/** chess.js's SAN for a found line: only the moves that are said. */
function sanLine(fen: string, line: readonly FastMove[]): string[] {
  const chess = new Chess(fen);
  return line.map((move) => chess.move({ from: squareOf(move.from), to: squareOf(move.to), promotion: move.promotion ? symbolOf(move.promotion) : undefined }).san);
}

function kingInDanger(board: FastBoard): boolean {
  const attacker = board.turn;
  const defender = attacker === 'w' ? 'b' : 'w';
  const king = board.kingOf(defender);
  if (king < 0) return false;
  const zone = [king, ...KING_STEPS.map(([df, dr]) => step(king, df, dr)).filter((square) => square >= 0)];
  const attackers = new Set(zone.flatMap((square) => attackersOf(board, square, attacker)));
  if (attackers.size >= 2) return true;
  return zone.filter((square) => square !== king).every((square) => {
    const piece = board.squares[square] ?? 0;
    return (piece !== 0 && (piece & 8 ? 'b' : 'w') === defender) || attackersOf(board, square, attacker, true).length > 0;
  });
}
