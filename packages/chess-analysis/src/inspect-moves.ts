import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { AttackedPieceDto, PositionFeatures } from '@freechesscoach/shared';
import { toColorName, type ColorName } from './attack-map.js';
import { computePositionFeatures } from './position-features.js';

/**
 * Backs the coach agent's `check_moves` tool: "is this move actually legal
 * here, and what does it actually do?" — answered from chess.js alone, with
 * no engine round-trip, so the coach can verify a move it is about to name
 * as often as it likes. The engine (`get_engine_analysis`) answers how GOOD
 * a move is; this answers whether it EXISTS and what it touches, which is
 * the class of claim the coach was getting wrong.
 *
 * Pure and I/O-free (AGENTS rule 5) — the coach-facing text is rendered
 * from this shape in `packages/prompts`, never here.
 */
export interface IllegalMoveInspection {
  requested: string;
  legal: false;
  /** Legal moves the same piece DOES have here — what makes an illegal-move
   * answer useful instead of just a rejection. Empty when nothing on the
   * board matches the requested piece at all. */
  alternatives: string[];
}

export interface LegalMoveInspection {
  requested: string;
  legal: true;
  /** chess.js's normalized SAN — the spelling the coach should use, which
   * is not always the spelling it asked with. */
  san: string;
  from: string;
  to: string;
  piece: PieceSymbol;
  color: ColorName;
  captured: PieceSymbol | null;
  gives: 'check' | 'checkmate' | null;
  resultFen: string;
  /** The MOVER's own pieces left undefended-and-attacked after this move —
   * the cheap half of "does this actually win material, or hang something?" */
  leavesHanging: AttackedPieceDto[];
  /** Forks the mover has in the resulting position. */
  createsForks: PositionFeatures['forks'];
}

export type MoveInspection = LegalMoveInspection | IllegalMoveInspection;

export interface PositionInspection {
  fen: string;
  turn: ColorName;
  boardState: PositionFeatures['boardState'];
  legalMoveCount: number;
  /** Hanging pieces of BOTH colors in the position as it stands. */
  hangingPieces: AttackedPieceDto[];
  favorableCaptures: PositionFeatures['captureOpportunities'];
  moves: MoveInspection[];
  /** Non-null only when `fen` itself could not be loaded — the caller must
   * report that rather than pretend it inspected a position. */
  error: string | null;
}

const PIECE_LETTERS: Record<string, PieceSymbol> = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };

export function inspectMoves(fen: string, sanMoves: string[]): PositionInspection {
  const chess = loadPosition(fen);
  if (!chess) {
    return {
      fen,
      turn: 'white',
      boardState: 'none',
      legalMoveCount: 0,
      hangingPieces: [],
      favorableCaptures: [],
      moves: [],
      error: 'that fen could not be read as a position'
    };
  }

  const features = computePositionFeatures(fen);
  return {
    fen,
    turn: features.turn,
    boardState: features.boardState,
    legalMoveCount: features.availableMoves.length,
    hangingPieces: features.hangingPieces,
    favorableCaptures: features.captureOpportunities.filter((capture) => capture.favorable),
    moves: sanMoves.map((san) => inspectOne(fen, chess, san)),
    error: null
  };
}

function loadPosition(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** One inspection per requested move, each replayed on its own board — a
 * shared instance would leave the position one move deep for the next
 * request, which is exactly the silent drift this tool exists to prevent. */
function inspectOne(fen: string, position: Chess, requested: string): MoveInspection {
  const board = new Chess(fen);
  const move = tryMove(board, requested);
  if (!move) return { requested, legal: false, alternatives: alternativesFor(position, requested) };

  const resultFen = board.fen();
  const after = computePositionFeatures(resultFen);
  return {
    requested,
    legal: true,
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    color: toColorName(move.color),
    captured: move.captured ?? null,
    gives: checkState(board),
    resultFen,
    leavesHanging: after.hangingPieces.filter((piece) => piece.color === toColorName(move.color)),
    createsForks: after.forks.filter((fork) => board.get(fork.square as Square)?.color === move.color)
  };
}

function tryMove(board: Chess, requested: string): Move | null {
  try {
    return board.move(requested);
  } catch {
    return null;
  }
}

function checkState(board: Chess): 'check' | 'checkmate' | null {
  if (board.isCheckmate()) return 'checkmate';
  if (board.isCheck()) return 'check';
  return null;
}

/**
 * What the piece the coach named can actually do here. The hint is read off
 * the requested text the way a reader would: a leading piece letter ("Nf6"),
 * otherwise an origin square if the move was written in long algebraic
 * ("e2e5"), otherwise a pawn move.
 */
function alternativesFor(position: Chess, requested: string): string[] {
  const legal = position.moves({ verbose: true });
  const matching = legal.filter((move) => matchesHint(move, requested));
  return matching.slice(0, 8).map((move) => move.san);
}

function matchesHint(move: Move, requested: string): boolean {
  const fromSquare = originSquareHint(requested);
  if (fromSquare) return move.from === fromSquare;
  const piece = PIECE_LETTERS[requested.charAt(0)];
  return piece ? move.piece === piece : move.piece === 'p';
}

function originSquareHint(requested: string): string | null {
  const match = /^([a-h][1-8])[a-h][1-8]/.exec(requested);
  return match?.[1] ?? null;
}
