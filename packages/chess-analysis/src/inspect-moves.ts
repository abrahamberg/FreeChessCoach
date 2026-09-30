import { Chess, type Move, type PieceSymbol } from 'chess.js';
import type { PositionFeatures } from '@freechesscoach/shared';
import type { ColorName } from './attack-map.js';
import { boardFacts } from './board-facts/move-facts.js';
import { loosePieces, type LoosePiece } from './board-facts/loose-pieces.js';
import type { BoardFact } from './board-facts/types.js';
import { replayMove, type IllegalMoveInspection, type ReplayedMove } from './inspect-move.js';

export type { IllegalMoveInspection };

export interface LegalMoveInspection extends ReplayedMove {
  /** What the move does on the board (`boardFacts`). */
  facts: BoardFact[];
}

export type MoveInspection = LegalMoveInspection | IllegalMoveInspection;
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
export interface PositionInspection {
  fen: string;
  turn: ColorName;
  boardState: PositionFeatures['boardState'];
  legalMoveCount: number;
  /** Pieces of BOTH colors the other side could win in the position as it
   * stands (`loosePieces`: a capture must be legal and come out ahead). */
  loose: LoosePiece[];
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
      loose: [],
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
    loose: [...loosePieces(fen, 'w'), ...loosePieces(fen, 'b')],
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

function inspectOne(fen: string, position: Chess, requested: string): MoveInspection {
  const inspected = replayMove(fen, requested);
  if (!inspected) return { requested, legal: false, alternatives: alternativesFor(position, requested) };
  return { ...inspected, facts: boardFacts(fen, inspected.san) };
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
