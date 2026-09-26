import { DIAGNOSIS_CODES_BY_ID, type PuzzleSessionDetail } from '@freechesscoach/shared';

/** The side the student plays: the item's FEN has the opponent to move (the
 * line's first move sets the puzzle up), matching usePuzzleSessionPageData's
 * board orientation. */
function studentSide(fen: string): string {
  return fen.split(' ')[1] === 'w' ? 'Black' : 'White';
}

function focusFact(session: PuzzleSessionDetail): string | null {
  const label = DIAGNOSIS_CODES_BY_ID.get(session.assignment.diagnosisCode)?.label;
  return label ? `Focus: ${label}` : null;
}

function progressFact(session: PuzzleSessionDetail): string | null {
  const index = session.currentItemIndex;
  if (index === 0) return null;
  const solved = session.assignment.items.slice(0, index).filter((item) => item.result === 'solved').length;
  return `Solved ${solved} of ${index} so far`;
}

/** What the kickoff loader reveals while the coach prepares its opening turn
 * on a puzzle — the puzzle-session counterpart of session/kickoff-facts.ts.
 * Deliberately no themes or line length: those would hint at the answer the
 * coach wants the student to find. */
export function buildPuzzleKickoffFacts(session: PuzzleSessionDetail | null | undefined): string[] {
  const item = session?.assignment.items[session.currentItemIndex];
  if (!session || !item) return [];
  return [
    focusFact(session),
    `Practice ${session.currentItemIndex + 1} of ${session.assignment.items.length}`,
    progressFact(session),
    `Puzzle rated ${Math.round(item.rating)}`,
    `You play ${studentSide(item.fen)}`
  ].filter((fact): fact is string => fact !== null);
}
