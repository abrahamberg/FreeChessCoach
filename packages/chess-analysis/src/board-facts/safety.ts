import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAMES } from '../piece-names.js';
import { see } from '../see.js';
import { isProfitableCaptureOn } from '../tactic-board-facts.js';
import { pins } from '../tactic-pins.js';
import { trappedPieces } from '../tactic-trapped.js';
import { PIECE_VALUES } from '../tactics.js';

const VALUABLE = new Set(['n', 'b', 'r', 'q']);

/** tactics.ts's values, the king above everything: it never trades, and
 * never traps a piece. */
export const valueOf = (piece: PieceSymbol): number => (piece === 'k' ? 100 : PIECE_VALUES[piece]);

/** A legal capture on the square that does not lose material over the
 * whole exchange (the shared SEE): a free piece, or one only traded off, as
 * a forker that can be traded has forked nothing. The first real runs read
 * "leaves the rook on a1 hanging" after 6.Bc3 in the Englund, where …Qxa1
 * loses the queen to Bxa1. */
export function canBeTaken(fenAfter: string, square: string): boolean {
  const chess = new Chess(fenAfter);
  const target = square as Square;
  const legal = chess.attackers(target, chess.turn()).some((from) => chess.moves({ square: from, verbose: true }).some((move) => move.to === target));
  return legal && see(fenAfter, target, chess.turn()) >= 0;
}

/** Enemy knights, bishops, rooks and queens the moved piece now hits. */
export function attackedPieces(fenAfter: string, from: Square): string[] {
  const chess = new Chess(fenAfter);
  const mover = chess.get(from);
  if (!mover) return [];
  const targets: string[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color === mover.color || !VALUABLE.has(cell.type)) continue;
      if (!chess.attackers(cell.square, mover.color).includes(from)) continue;
      const target = `the ${PIECE_NAMES[cell.type]} on ${cell.square}`;
      const pin = pinOf(fenAfter, cell.square);
      const boxed = !chess.moves({ square: cell.square }).length && chess.turn() === cell.color;
      const trapped = isTrapped(fenAfter, cell.square, from) ? (boxed ? ', which is trapped: it cannot move, and no move saves it' : ', which is trapped: every square it can reach loses it') : '';
      targets.push(`attacks ${target}${pin ? `, which is pinned to ${pin}` : ''}${trapped}`);
    }
  }
  return targets;
}

/** "the king by the bishop on b5" or "the queen on d8 by the bishop on g5",
 * from the shared `pins()`: pinned to the king, or to the queen by a
 * cheaper piece. The Elephant's bait never said the knight on f6 was
 * pinned, which is why Nxd5 looks safe. */
function pinOf(fenAfter: string, square: Square): string | null {
  const chess = new Chess(fenAfter);
  const hits = pins(chess).filter((hit) => hit.pinned === square);
  const name = (at: Square): string => PIECE_NAMES[chess.get(at)!.type];
  const toKing = hits.find((hit) => hit.kind === 'absolute');
  if (toKing) return `the king by the ${name(toKing.by)} on ${toKing.by}`;
  const toQueen = hits.find((hit) => chess.get(hit.against)?.type === 'q' && chess.get(hit.by)?.type !== 'q');
  return toQueen ? `the queen on ${toQueen.against} by the ${name(toQueen.by)} on ${toQueen.by}` : null;
}

/** The shared `trappedPieces` (lost where it stands and wherever it goes,
 * over the whole exchange), for a piece the moved piece attacks: Noah's Ark
 * ended on "attacks the bishop on b3" and nothing said the bishop had
 * nowhere to go. Two conditions on the attacker are the course's own: it is
 * cheaper, so a defender does not help, and it cannot simply be taken (the
 * Immortal's Nb6 on the rook, answered by …axb6). */
function isTrapped(fenAfter: string, square: Square, by: Square): boolean {
  const chess = new Chess(fenAfter);
  const piece = chess.get(square);
  const attacker = chess.get(by);
  if (!piece || !attacker || valueOf(attacker.type) >= valueOf(piece.type) || isLostOn(fenAfter, by)) return false;
  return trappedPieces(chess, piece.color).some((hit) => hit.square === square);
}

/** The side to move takes on the square and comes out ahead: the shared
 * SEE's profitable capture. */
function isLostOn(fen: string, square: string): boolean {
  return isProfitableCaptureOn(fen, square as Square, new Chess(fen).turn());
}
