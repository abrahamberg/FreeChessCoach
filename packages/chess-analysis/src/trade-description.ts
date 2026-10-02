import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { capitalise } from '@freechesscoach/shared';
import { developedMinorPieceCount } from './opening-development.js';
import { CONFIG } from './config.js';
import { PIECE_NAMES } from './piece-names.js';
import { BISHOP_KNIGHT_GAP_CP, see } from './see.js';

/** One pawn on `see.ts`'s scale. */
const { minThreatSeeCp: PAWN_CP } = CONFIG.evalWitness;

/**
 * What an ordinary exchange is, said plainly.
 *
 * A recapture is the most common move in chess and the review had no word
 * for one: `4…Nxd4` came back as nothing but "Best move", and `5.Nxd4` — the
 * natural retake — came back as "Costs 8 squares of piece mobility". Both
 * are the same gap. The player knows they took a piece; what a note is worth
 * saying is which exchange this was, and that the material came out level.
 *
 * Only even exchanges get a sentence here. A capture that wins material is
 * the tactic detectors' business, and one that loses it is already the
 * hanging-piece/undefended reasons' business — saying "trades the knight"
 * over either would be describing the shape and missing the point.
 */
export interface TradeDescriptionInput {
  fenBefore: string;
  moveSan: string;
  /** The opponent's previous move captured on this same square — computed
   * for the classifier already (`classify.ts`), so this never re-derives it. */
  isRecapture: boolean;
  /** The engine's answer to the move, when its line is known: how the other
   * side takes back is part of what the trade was worth. */
  replySan?: string;
}

export function describeTrade(input: TradeDescriptionInput): string | null {
  const board = new Chess(input.fenBefore);
  const move = tryMove(board, input.moveSan);
  if (!move?.captured) return null;

  const square = move.to as Square;
  const taken = PIECE_NAMES[move.captured];
  if (input.isRecapture) return `Recaptures the ${taken} on ${square}`;

  // Nobody can take back, so nothing was traded — the move won a piece, lost
  // one, or picked up a loose pawn, and each of those has its own note.
  if (!(isEnPassant(move) ? isEvenEnPassant(board.fen(), move) : isEvenExchange(input.fenBefore, square, move.color))) return null;
  const cost = tradeCost(input, move, board);
  if (move.piece === move.captured) return `Trades ${plural(move.piece)} on ${square}${cost}`;
  // A bishop and a knight are the one even pair of unlike pieces. Any other
  // pair that comes out level did so over a longer exchange, and the first
  // capture is not what was traded: 13.Rxd7 in the Opera game is no "rook
  // for the knight".
  if (!isMinor(move.piece) || !isMinor(move.captured)) return null;
  return `Trades the ${PIECE_NAMES[move.piece]} for the ${taken} on ${square}${cost}`;
}

/**
 * What an even trade gives up, when the board shows it. 5.Bxf6 Qxf6 in the
 * owner's game costs nothing in material and the engine barely minds, yet it
 * is a poor trade for a plain reason: the bishop was White's only developed
 * piece, and Black's queen comes out by taking back.
 *
 * Board facts only (chess.js and the engine's reply), no eval claim. Said
 * only of a minor piece that was the side's one developed piece: measured on
 * the dev games, the recapture alone ("can take back with the queen,
 * bringing it out") fired on 89 trades, a bishop "developed" at move 27 among
 * them; with this test it is 21, all in the opening.
 */
function tradeCost(input: TradeDescriptionInput, move: Move, after: Chess): string {
  const mover = sideName(move.color);
  const lone = isMinor(move.piece) && minorCount(input.fenBefore, move.color) >= OPENING_MINORS && developedMinorPieceCount(input.fenBefore, mover) === 1 && developedMinorPieceCount(without(input.fenBefore, move.from), mover) === 0;
  if (!lone) return '';
  const givesUp = `, giving up ${capitalise(mover)}'s only developed piece`;

  const reply = input.replySan ? tryMove(after, input.replySan) : null;
  if (!reply?.captured || reply.to !== move.to) return givesUp;
  const leavesHome = reply.from[1] === HOME_RANK[reply.color];
  const gain = reply.piece === 'q' && leavesHome ? 'bringing it out' : isMinor(reply.piece) && leavesHome ? 'developing it' : null;
  return gain ? `${givesUp}; ${capitalise(sideName(reply.color))} can take back with the ${PIECE_NAMES[reply.piece]}, ${gain}` : givesUp;
}

/** Three of the four minor pieces still on the board: an opening, where
 * "the only developed piece" means something. */
const OPENING_MINORS = 3;
const HOME_RANK: Record<Color, string> = { w: '1', b: '8' };
const sideName = (color: Color): 'white' | 'black' => (color === 'w' ? 'white' : 'black');

function without(fen: string, square: Square): string {
  const board = new Chess(fen);
  board.remove(square);
  return board.fen();
}

function minorCount(fen: string, color: Color): number {
  return new Chess(fen)
    .board()
    .flat()
    .filter((piece) => piece !== null && piece.color === color && isMinor(piece.type)).length;
}

const isMinor = (piece: PieceSymbol): boolean => piece === 'b' || piece === 'n';

/** SEE is from the capturer's point of view, and level is zero, give or take
 * a bishop against a knight: `see.ts` prices them ten points apart, so a
 * bishop given for a knight came out at -10 and had no sentence. A won or
 * lost one is somebody else's sentence. */
function isEvenExchange(fenBefore: string, square: Square, capturer: Color): boolean {
  return Math.abs(see(fenBefore, square, capturer)) <= BISHOP_KNIGHT_GAP_CP;
}

const isEnPassant = (move: Move): boolean => move.flags.includes('e');

/** En passant takes a pawn that does not stand on the square it lands on, so
 * the exchange is read after the move: level when the pawn that took can be
 * taken back for nothing more. 1.fxg6# in a mating puzzle was "Trades pawns
 * on g6". */
function isEvenEnPassant(fenAfter: string, move: Move): boolean {
  const takenBack = see(fenAfter, move.to, move.color === 'w' ? 'b' : 'w');
  return Math.abs(PAWN_CP - takenBack) <= BISHOP_KNIGHT_GAP_CP;
}

function tryMove(board: Chess, moveSan: string): ReturnType<Chess['move']> | null {
  try {
    return board.move(moveSan);
  } catch {
    return null;
  }
}

function plural(piece: PieceSymbol): string {
  return `${PIECE_NAMES[piece]}s`;
}
