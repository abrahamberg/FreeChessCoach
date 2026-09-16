import type { LegalMoveInspection, MoveInspection, PositionInspection } from '@freechesscoach/chess-analysis';
import type { AttackedPieceDto, PositionFeatures } from '@freechesscoach/shared';

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};

/**
 * Coach-facing digest for the `check_moves` tool (AGENTS.md golden rule 8:
 * structured data is digested into short prose before it reaches the
 * coach's context). Deterministic, no LLM round-trip — same discipline
 * position-analysis-summary.ts applies to engine output.
 *
 * Every line is a fact the coach would otherwise be tempted to assert from
 * memory: whether the move exists, what it captures, what it leaves
 * hanging. An illegal move is answered with what that piece CAN do, so the
 * coach can correct itself in the same turn instead of asking again.
 */
export function renderMoveInspection(inspection: PositionInspection): string {
  if (inspection.error) return `Could not read that position: ${inspection.error}. Get a fen from show_position, check_position or hypothetical_line and try again.`;

  return [renderPositionFacts(inspection), ...inspection.moves.map(renderMove)].join('\n\n');
}

/**
 * The position's own facts, with no candidate moves attached. Also used by
 * the per-turn "## Current position" block (episode-context.ts) so the
 * coach always has the board's basic truth — side to move, check, what is
 * hanging — for the position it is actually on, without spending a tool
 * call to ask.
 */
export function renderPositionFacts(inspection: PositionInspection): string {
  if (inspection.error) return `unavailable — ${inspection.error}`;
  const lines = [`${inspection.turn} to move${boardStateClause(inspection.boardState)}. ${inspection.legalMoveCount} legal moves.`];
  if (inspection.hangingPieces.length > 0) {
    lines.push(`Hanging right now: ${inspection.hangingPieces.map(describeAttackedPiece).join(', ')}.`);
  }
  if (inspection.favorableCaptures.length > 0) {
    lines.push(`Favorable captures available: ${inspection.favorableCaptures.map((capture) => capture.moveSan).join(', ')}.`);
  }
  return lines.join('\n');
}

function boardStateClause(boardState: PositionInspection['boardState']): string {
  if (boardState === 'none') return '';
  if (boardState === 'check') return ', in check';
  return `, ${boardState}`;
}

function renderMove(move: MoveInspection): string {
  if (!move.legal) return renderIllegalMove(move.requested, move.alternatives);
  return renderLegalMove(move);
}

/** The whole point of the tool: an illegal move is named illegal in plain
 * words, never softened into "unusual" or silently corrected to a
 * neighbouring move the coach did not ask about. */
function renderIllegalMove(requested: string, alternatives: string[]): string {
  const suggestion =
    alternatives.length > 0
      ? ` That piece's legal moves here: ${alternatives.join(', ')}.`
      : ' No piece of that kind has a legal move here.';
  return `${requested}: NOT LEGAL in this position — do not tell the student this move is playable.${suggestion}`;
}

function renderLegalMove(move: LegalMoveInspection): string {
  const parts = [`${move.san}: legal (${move.color} ${pieceName(move.piece)} ${move.from}-${move.to}${captureClause(move)}${checkClause(move)}).`];
  if (move.leavesHanging.length > 0) {
    parts.push(`After it, ${move.color} leaves hanging: ${move.leavesHanging.map(describeAttackedPiece).join(', ')}.`);
  }
  if (move.createsForks.length > 0) {
    parts.push(`It sets up: ${move.createsForks.map(describeFork).join(', ')}.`);
  }
  parts.push(`Resulting fen: ${move.resultFen}`);
  return parts.join('\n');
}

function captureClause(move: LegalMoveInspection): string {
  return move.captured ? `, takes the ${pieceName(move.captured)}` : '';
}

function checkClause(move: LegalMoveInspection): string {
  if (move.gives === 'checkmate') return ', checkmate';
  if (move.gives === 'check') return ', check';
  return '';
}

function describeAttackedPiece(piece: AttackedPieceDto): string {
  return `${piece.color} ${pieceName(piece.piece)} on ${piece.square} (${piece.attackers} attacker(s), no defender)`;
}

function describeFork(fork: PositionFeatures['forks'][number]): string {
  return `${pieceName(fork.piece)} on ${fork.square} attacking ${fork.forkedSquares.join(' and ')}`;
}

function pieceName(piece: string): string {
  return PIECE_NAMES[piece] ?? piece;
}
