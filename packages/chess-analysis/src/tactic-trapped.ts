import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { occupiedSquares, opponentOf } from './attack-map.js';
import { see } from './see.js';
import { PIECE_VALUES } from './tactics.js';

export interface TrappedHit {
  square: Square;
  piece: PieceSymbol;
}

/**
 * A piece of `color` that is lost where it stands and on every square it can
 * move to, over the whole exchange (the shared SEE in `see.ts`), unless a
 * move first takes as much as it is worth. The first version called a
 * piece safe only on a square the opponent did not attack at all, and
 * attacked on any other, defended or not: 29/40 on Lichess's trappedPiece
 * puzzles; with the exchange played out, 40/40, the precision corpus
 * unchanged. The course dossier's "which is trapped" is this check too.
 * `chess` must already have `color` to move (true whenever this is called
 * on the position right after the opponent's move, which is the only time
 * this question makes sense to ask).
 *
 * Pawns are never candidates: a pawn backed into a corner with no square to
 * advance to is just a normal, expected feature of closed pawn play, not a
 * "trapped piece" tactic — only pieces (knight, bishop, rook, queen) count.
 *
 * Two exclusions come from `docs/tactics-rework.md` §1: `chess.moves({
 * square })` returns nothing for two reasons far more common than being
 * cornered, and attributing every report across the 400-line opening corpus
 * put **71.7% on absolute pins and 13.2% on the side simply being in check**
 * — 85% of the output in ordinary play was an artefact of reading "cannot
 * move" as "has nowhere to go".
 *
 * - **Side in check.** Every non-king piece has zero legal moves that don't
 *   address the check. The tactic there is the check, not a trap, so the
 *   whole position is skipped.
 * - **Absolutely pinned.** A pinned knight on its natural square, defended,
 *   is pinned — a motif we already have a word for. Reporting it as trapped
 *   as well is the noisy co-fire on every real pin (TR-01, TR-10).
 */
export function trappedPieces(chess: Chess, color: Color): TrappedHit[] {
  if (chess.turn() !== color) return [];
  // A piece cannot be shown to have no escape while its side owes a reply to
  // a check — every legal move is a check answer, so the move list says
  // nothing about that piece's own mobility.
  if (chess.isCheck()) return [];

  const opponent = opponentOf(color);
  const hits: TrappedHit[] = [];

  for (const piece of occupiedSquares(chess)) {
    if (piece.color !== color || piece.type === 'k' || piece.type === 'p') continue;
    // Lost where it stands over the whole exchange (the shared SEE), not
    // merely attacked: a defended knight a bishop hits is not trapped.
    if (see(chess.fen(), piece.square, opponent) <= 0) continue;
    if (isAbsolutelyPinned(chess, piece.square, color)) continue;

    // Every move lands where it is lost too, without first taking as much
    // as it is worth (a trapped queen that takes a queen has traded).
    const value = PIECE_VALUES[piece.type];
    const own = chess.moves({ square: piece.square, verbose: true });
    const escapes = own.some(
      (move) => (move.captured !== undefined && PIECE_VALUES[move.captured] >= value) || see(move.after, move.to as Square, opponent) <= 0
    );
    if (escapes || (own.length === 0 && rescued(chess, piece.square, opponent))) continue;
    hits.push({ square: piece.square, piece: piece.type });
  }
  return hits;
}

/** A piece boxed in by its own men, saved by another move: a block, or a
 * man stepping aside so it stands safe (a rook in its corner behind the
 * knight on b8, which …Nc6 shields and …Nd7 frees). */
function rescued(chess: Chess, square: Square, opponent: Color): boolean {
  return chess.moves({ verbose: true }).some((move) => move.from !== square && see(move.after, square, opponent) <= 0);
}

/**
 * Is this piece pinned against its own king?
 *
 * Having no legal moves is necessary but not sufficient: a piece can also be
 * boxed in because its own men occupy every square it reaches, and such a
 * piece under attack is the most cornered a piece gets — exactly what this
 * function must not swallow. So the empty move list is confirmed by lifting
 * the piece off a copy of the board and asking whether the king is then
 * attacked, which is the definition of an absolute pin and nothing else.
 */
function isAbsolutelyPinned(chess: Chess, square: Square, color: Color): boolean {
  if (chess.turn() !== color) return false;
  if (chess.moves({ square }).length > 0) return false;

  const withoutPiece = new Chess(chess.fen());
  withoutPiece.remove(square);
  const king = occupiedSquares(withoutPiece).find((piece) => piece.type === 'k' && piece.color === color);
  return king !== undefined && withoutPiece.isAttacked(king.square, opponentOf(color));
}
