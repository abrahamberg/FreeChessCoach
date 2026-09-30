import { renderBoardFact, type BoardFact, type LegalMoveInspection, type LoosePiece, type MoveInspection, type PositionInspection } from '@freechesscoach/chess-analysis';

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
  if (inspection.error) return `Could not read that position: ${inspection.error}. Copy a fen exactly from a tool result or your prompt — never type one out yourself — and try again.`;

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
  if (inspection.loose.length > 0) {
    lines.push(`Loose right now: ${describeLoose(inspection.loose)}.`);
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

/**
 * One line of verified facts about a single legal move — what it takes,
 * whether it checks, what it leaves hanging, what it sets up. Used to annotate
 * a known puzzle line so the coach reads the line from checked facts rather
 * than guessing what each move does. Illegal moves render as a plain marker.
 */
export function renderMoveNote(move: MoveInspection): string {
  if (!move.legal) return `${move.requested} (could not be read)`;
  const facts = [...renderedFacts(move.facts)];
  if (move.leavesLoose.length > 0) facts.push(`leaves loose: ${describeLoose(move.leavesLoose)}`);
  return `${move.san} — ${move.color} ${facts.join('; ')}`;
}

/** The move's facts as phrases. A piece left hanging is listed with the other
 * loose pieces, with its tier, so it is left out here. */
function renderedFacts(facts: readonly BoardFact[]): string[] {
  return facts.filter((fact) => fact.kind !== 'leavesHanging').map(renderBoardFact);
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
  const parts = [`${move.san}: legal (${move.color} ${renderedFacts(move.facts).join('; ')}).`];
  if (move.leavesLoose.length > 0) parts.push(`After it, ${move.color} leaves loose: ${describeLoose(move.leavesLoose)}.`);
  parts.push(`Resulting fen: ${move.resultFen}`);
  return parts.join('\n');
}

/** "the white knight on f3 (can be won)": `winnable` is defended but loses the
 * exchange, `free` has no defender at all. */
export function describeLoose(pieces: readonly LoosePiece[]): string {
  return pieces
    .map((piece) => `the ${piece.owner === 'w' ? 'white' : 'black'} ${pieceName(piece.piece)} on ${piece.square} (${piece.tier === 'free' ? 'undefended' : 'can be won'})`)
    .join(', ');
}

function pieceName(piece: string): string {
  return PIECE_NAMES[piece] ?? piece;
}
