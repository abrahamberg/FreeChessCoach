import type { EngineEval, MovePhase, MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import type { ClassifiedMove } from './classify.js';
import { CONFIG } from './config.js';
import { abandonedGuard, betterMoveFacts, boardFacts, lineWords, positionWords } from './course-dossier-words.js';
import type { CourseTemptingFacts } from './course-tempting.js';
import type { CourseTreeNode } from './course-tree.js';
import { isBookMoveFrom, resolveOpening } from './opening-book.js';
import { positionKey } from './opening-book-key.js';
import { tacticAllowedReason, tacticOpportunityReason } from './tactic-reason-text.js';
import { toCpWhite, winPctFor } from './win-probability.js';

const BEST_LINE_PLIES = 6;

export interface CourseNodeFacts {
  nodeId: string;
  san: string;
  side: 'white' | 'black';
  lineId: string;
  moveNumber: number;
  quality: MoveQuality;
  /** White's view after the move, mate clamped (classify.ts): the course
   * player's eval bar and graph. */
  evalAfterCp: number;
  /** The position before and after, in words. */
  before: string;
  after: string;
  inBook: boolean;
  openingName: string | null;
  /** The engine's best move and line (at most 6 plies) when the course move
   * is not it, with its board facts (`betterMoveFacts`); `board` is absent in
   * dossiers stored before it existed. */
  bestInstead: { san: string; line: string[]; board?: string[] } | null;
  board: string[];
  /** Checked tactic sentences (`tactic-reason-text.ts`), learner = "you".
   * Not the review's prevention sentences ("you stopped them winning a
   * bishop through a fork"): about a move nobody played, the model presented
   * them as the point of the move. */
  tactics: string[];
  /** The motif the move plays, when the detectors found one. */
  motif: TacticMotifType | null;
  /** The engine's other top moves, in words. */
  alternatives: { san: string; verdict: string }[];
  /** §13.5: checks, captures and threats that look right here and fail,
   * with the engine's answer (`withTempting`, after a second engine batch);
   * empty until then. */
  tempting: CourseTemptingFacts[];
  quizEligible: boolean;
  critical: boolean;
  creatorComment: string | null;
  /** For the skeleton only, never rendered: the mover's win% drop and the game phase. */
  winDrop: number;
  phase: MovePhase | null;
}

export interface CourseNodeFactsInput {
  node: CourseTreeNode;
  move: ClassifiedMove;
  fenBefore: string;
  /** The line's positions from the start up to and including this node's. */
  linePositionFens: string[];
  evalsByFen: ReadonlyMap<string, EngineEval>;
  critical: boolean;
  learnerSide: 'white' | 'black';
}

export function buildCourseNodeFacts(input: CourseNodeFactsInput): CourseNodeFacts {
  const { node, move, fenBefore, evalsByFen } = input;
  const evalBefore = evalsByFen.get(fenBefore);
  const side = move.mover;
  const opening = resolveOpening(input.linePositionFens.map(positionKey));
  return {
    nodeId: node.id,
    san: node.san,
    side,
    lineId: node.lineId,
    moveNumber: Number(fenBefore.split(' ')[5] ?? 1),
    quality: move.quality,
    evalAfterCp: move.evalAfterCp,
    before: positionWords(fenBefore, evalBefore),
    after: positionWords(node.fenAfter, evalsByFen.get(node.fenAfter)),
    inBook: isBookMoveFrom(fenBefore, node.san),
    openingName: opening?.name ?? null,
    bestInstead: bestInstead(move, node.san, fenBefore),
    board: [...boardFacts(fenBefore, node.san), ...abandonedGuard(fenBefore, node.san, evalsByFen.get(node.fenAfter)?.lines[0]?.moveSan)],
    tactics: tacticSentences(move, side === input.learnerSide),
    motif: move.tacticOpportunity?.found ? move.tacticOpportunity.type : null,
    alternatives: (evalBefore?.lines ?? []).filter((line) => line.moveSan !== node.san).map((line) => ({ san: line.moveSan, verdict: lineWords(line) })),
    tempting: [],
    quizEligible: isQuizEligible(evalBefore, node.san, side),
    critical: input.critical,
    creatorComment: node.comment,
    winDrop: move.drop ?? 0,
    phase: move.phase ?? null
  };
}

function bestInstead(move: ClassifiedMove, san: string, fenBefore: string): CourseNodeFacts['bestInstead'] {
  const best = move.bestMoveSan ?? move.bestLineSan[0];
  if (!best || best === san) return null;
  const line = move.bestLinePvSan?.length ? move.bestLinePvSan : move.bestLineSan;
  return { san: best, line: line.slice(0, BEST_LINE_PLIES), board: betterMoveFacts(fenBefore, san, best) };
}

function tacticSentences(move: ClassifiedMove, isUserMove: boolean): string[] {
  const sentences: string[] = [];
  if (move.tacticOpportunity) sentences.push(tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove }, move.bestMoveSan));
  if (move.tacticAllowed) sentences.push(tacticAllowedReason({ ...move.tacticAllowed, isUserMove }));
  return sentences;
}

/** One move is clearly best, and it is the course move. */
function isQuizEligible(evaluation: EngineEval | undefined, san: string, side: 'white' | 'black'): boolean {
  const [first, second] = evaluation?.lines ?? [];
  if (!first || !second || first.moveSan !== san) return false;
  return winPctFor(side, toCpWhite(first)) - winPctFor(side, toCpWhite(second)) > CONFIG.courses.onlyMoveGap;
}
