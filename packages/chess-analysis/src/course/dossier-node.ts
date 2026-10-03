import { Chess } from 'chess.js';
import type { EngineEval, MovePhase, MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import type { ClassifiedMove } from '../classify.js';
import { CONFIG } from '../config.js';
import { abandonedGuard, betterMoveFacts, replyFork } from '../board-facts/better-move.js';
import { boardFacts } from '../board-facts/move-facts.js';
import { isOnlyMove } from '../board-facts/only-move.js';
import type { BoardFact } from '../board-facts/types.js';
import { lineWords, positionWords } from '../board-facts/verdict-words.js';
import { lineBalance, settledLine } from '../board-facts/material.js';
import type { CourseTemptingFacts } from './tempting.js';
import type { CourseTreeNode } from './tree.js';
import { isBookMoveFrom, resolveOpening } from '../opening-book.js';
import { positionKey } from '../opening-book-key.js';
import { tacticAllowedReason, tacticOpportunityReason } from '../tactic-reason-text.js';


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
   * is not it, with its board facts (`betterMoveFacts`) and the material at
   * the line's end ("White is a pawn up"). */
  /** The engine sees a forced mate after the move: a sentence about winning material would undersell it. */
  mateAhead: boolean;
  bestInstead: { san: string; line: string[]; board: BoardFact[]; balance: string } | null;
  board: BoardFact[];
  /** Checked tactic sentences (`tactic-reason-text.ts`), learner = "you".
   * Not the review's prevention sentences ("you stopped them winning a
   * bishop through a fork"): about a move nobody played, the model presented
   * them as the point of the move. */
  tactics: string[];
  /** The motif the move plays, when the detectors found one. */
  motif: TacticMotifType | null;
  /** The engine's other top moves, in words. None for a move that is checkmate. */
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
  const after = positionWords(node.fenAfter, evalsByFen.get(node.fenAfter));
  const reply = evalsByFen.get(node.fenAfter)?.lines[0]?.moveSan;
  return {
    nodeId: node.id,
    san: node.san,
    side,
    lineId: node.lineId,
    moveNumber: Number(fenBefore.split(' ')[5] ?? 1),
    quality: move.quality,
    evalAfterCp: move.evalAfterCp,
    before: positionWords(fenBefore, evalBefore),
    after,
    inBook: isBookMoveFrom(fenBefore, node.san),
    openingName: opening?.name ?? null,
    mateAhead: (evalsByFen.get(node.fenAfter)?.lines[0]?.mateIn ?? null) !== null,
    bestInstead: bestInstead(move, node.san, fenBefore),
    board: [...boardFacts(fenBefore, node.san), ...abandonedGuard(fenBefore, node.san, reply), ...replyFork(node.fenAfter, reply), ...repetition(node.fenAfter, input.linePositionFens)],
    tactics: tacticSentences(move, side === input.learnerSide),
    motif: move.tacticOpportunity?.found ? move.tacticOpportunity.type : null,
    alternatives: alternatives(evalBefore, node),
    tempting: [],
    quizEligible: isOnlyMove(evalBefore, node.san, side),
    critical: input.critical,
    creatorComment: node.comment,
    winDrop: move.drop ?? 0,
    phase: move.phase ?? null
  };
}

/** After a checkmate the mate is the whole description: 38…Rc1# listed
 * "Rxd2+: Black is much better" and "Ra2: Black is much better" (the owner's
 * calibration, 2026-10-01). */
function alternatives(evalBefore: EngineEval | undefined, node: CourseTreeNode): CourseNodeFacts['alternatives'] {
  if (new Chess(node.fenAfter).isCheckmate()) return [];
  if (!evalBefore) return [];
  return evalBefore.lines.filter((line) => line.moveSan !== node.san).map((line) => ({ san: line.moveSan, verdict: lineWords(line, evalBefore) }));
}

/** A perpetual check is a position that comes back: the perpetual's
 * 6.Qe8+ is 4.Qe8+ again, which no board fact said. */
function repetition(fenAfter: string, linePositionFens: readonly string[]): BoardFact[] {
  const key = positionKey(fenAfter);
  const times = linePositionFens.filter((fen) => positionKey(fen) === key).length;
  if (times >= 3) return [{ kind: 'repetition', times: 3 }];
  return times === 2 ? [{ kind: 'repetition', times: 2 }] : [];
}

function bestInstead(move: ClassifiedMove, san: string, fenBefore: string): CourseNodeFacts['bestInstead'] {
  const best = move.bestMoveSan ?? move.bestLineSan[0];
  if (!best || best === san) return null;
  const line = move.bestLinePvSan?.length ? move.bestLinePvSan : move.bestLineSan;
  const shown = settledLine(fenBefore, line.slice(0, CONFIG.courses.bestLinePlies));
  return { san: best, line: shown, board: betterMoveFacts(fenBefore, san, best), balance: lineBalance(fenBefore, shown) };
}

function tacticSentences(move: ClassifiedMove, isUserMove: boolean): string[] {
  const sentences: string[] = [];
  if (move.tacticOpportunity) sentences.push(tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove }, move.bestMoveSan));
  if (move.tacticAllowed) sentences.push(tacticAllowedReason({ ...move.tacticAllowed, isUserMove }));
  return sentences;
}
