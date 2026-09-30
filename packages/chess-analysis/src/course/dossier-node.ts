import type { EngineEval, EngineLine, MovePhase, MoveQuality, TacticMotifType } from '@freechesscoach/shared';
import { Chess } from 'chess.js';
import type { ClassifiedMove } from '../classify.js';
import { CONFIG } from '../config.js';
import { abandonedGuard, betterMoveFacts } from '../board-facts/better-move.js';
import { boardFacts } from '../board-facts/move-facts.js';
import { lineWords, positionWords } from '../board-facts/verdict-words.js';
import { lineBalance, settledLine } from '../board-facts/material.js';
import type { CourseTemptingFacts } from './tempting.js';
import type { CourseTreeNode } from './tree.js';
import { isBookMoveFrom, resolveOpening } from '../opening-book.js';
import { positionKey } from '../opening-book-key.js';
import { tacticAllowedReason, tacticOpportunityReason } from '../tactic-reason-text.js';
import { PIECE_VALUES } from '../tactics.js';
import { toCpWhite, winPctFor } from '../win-probability.js';


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
  bestInstead: { san: string; line: string[]; board: string[]; balance: string } | null;
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
  const after = positionWords(node.fenAfter, evalsByFen.get(node.fenAfter));
  // Once the position is a forced mate, a sentence about winning material
  // undersells it: the Immortal's 21.Nxg7+ "won a pawn" starts a mate in 2.
  const mateAhead = /forced mate/.test(after);
  // A pawn run in an endgame, or to the sixth rank and past it, is a race to
  // promote, not space: the square rule's 5.f8=Q read "pushes a pawn to f8,
  // taking space" (the review does not call that position an endgame).
  const rank = Number(/([1-8])(?:=[QRBN])?[+#]?$/.exec(node.san)?.[1] ?? 0);
  const deep = side === 'white' ? rank >= 6 : rank >= 1 && rank <= 3;
  const claims = move.phase === 'endgame' || deep ? withoutMotif(move, 'spaceGain') : move;
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
    bestInstead: bestInstead(move, node.san, fenBefore),
    board: [...boardFacts(fenBefore, node.san), ...abandonedGuard(fenBefore, node.san, evalsByFen.get(node.fenAfter)?.lines[0]?.moveSan), ...repetition(node.fenAfter, input.linePositionFens)],
    tactics: tacticSentences(claims, node.san, side === input.learnerSide, mateAhead, capturedValue(fenBefore, node.san)),
    motif: claims.tacticOpportunity?.found && fitsCourseMove(claims.tacticOpportunity, node.san, mateAhead) ? claims.tacticOpportunity.type : null,
    alternatives: (evalBefore?.lines ?? []).filter((line) => line.moveSan !== node.san).map((line) => ({ san: line.moveSan, verdict: lineWords(line) })),
    tempting: [],
    quizEligible: isQuizEligible(evalBefore, node.san, side),
    critical: input.critical,
    creatorComment: node.comment,
    winDrop: move.drop ?? 0,
    phase: move.phase ?? null
  };
}

/** A perpetual check is a position that comes back: the perpetual's
 * 6.Qe8+ is 4.Qe8+ again, which no board fact said. */
function repetition(fenAfter: string, linePositionFens: readonly string[]): string[] {
  const key = positionKey(fenAfter);
  const times = linePositionFens.filter((fen) => positionKey(fen) === key).length;
  if (times >= 3) return ['the position has now come three times: a draw by repetition'];
  return times === 2 ? ['the position has now come twice: a third time is a draw'] : [];
}

function bestInstead(move: ClassifiedMove, san: string, fenBefore: string): CourseNodeFacts['bestInstead'] {
  const best = move.bestMoveSan ?? move.bestLineSan[0];
  if (!best || best === san) return null;
  const line = move.bestLinePvSan?.length ? move.bestLinePvSan : move.bestLineSan;
  const shown = settledLine(fenBefore, line.slice(0, CONFIG.courses.bestLinePlies));
  return { san: best, line: shown, board: betterMoveFacts(fenBefore, san, best), balance: lineBalance(fenBefore, shown) };
}

/** The game review's defensive motifs, which read wrong on a check or a mate:
 * Réti's queen sacrifice 9.Qd8+ "saves the bishop on d2", and 11.Bd8# "moves
 * the bishop off g5, out of reach". */
const DEFENSIVE_MOTIFS = new Set<TacticMotifType>(['defendsHangingPiece', 'removesTarget', 'escapesFork', 'blocksThreat', 'breaksPin']);

/** A mate says why in its board facts; the review's sentence on it only
 * helps when it is about the mate: 17.Rd8# read "You won a knight through a
 * checkmate — rook on d8 forks b8 and e8", 4.Qxf7# "moves the queen off h5,
 * out of reach". */
function fitsCourseMove(claim: { type: TacticMotifType; gain?: { kind: string } }, san: string, mateAhead = false): boolean {
  // With a mate ahead only the mate is the point: the Fishing Pole's …Qh4
  // read "You took the open file".
  if (san.endsWith('#') || mateAhead) return claim.gain?.kind === 'mate';
  return !(DEFENSIVE_MOTIFS.has(claim.type) && san.endsWith('+'));
}

function tacticSentences(move: ClassifiedMove, san: string, isUserMove: boolean, mateAhead: boolean, took: number): string[] {
  const sentences: string[] = [];
  if (move.tacticOpportunity && fitsCourseMove(move.tacticOpportunity, san, mateAhead)) sentences.push(tacticOpportunityReason({ ...withoutSquareFork(withoutFileDetail(move.tacticOpportunity)), isUserMove }, move.bestMoveSan));
  // A move that took as much as the answer wins back lets nothing go: the
  // Fishing Pole's 6.hxg4 takes a knight, and read "They let you win a pawn".
  const allowedGain = move.tacticAllowed?.gain;
  const tookMore = allowedGain?.kind === 'material' && took >= allowedGain.pawns;
  if (move.tacticAllowed && !tookMore && !(mateAhead && allowedGain?.kind === 'material')) sentences.push(tacticAllowedReason({ ...withoutSquareFork(move.tacticAllowed), isUserMove }));
  return sentences;
}

/** What the move itself captured, in pawns. */
function capturedValue(fenBefore: string, san: string): number {
  try {
    const captured = new Chess(fenBefore).move(san).captured;
    return captured ? PIECE_VALUES[captured] : 0;
  } catch {
    return 0;
  }
}

function withoutMotif(move: ClassifiedMove, type: TacticMotifType): ClassifiedMove {
  return {
    ...move,
    tacticOpportunity: move.tacticOpportunity?.type === type ? undefined : move.tacticOpportunity,
    tacticAllowed: move.tacticAllowed?.type === type ? undefined : move.tacticAllowed
  };
}

/** A sacrifice is never for an open file: the stalemate save's …Rg2+ read
 * "a brilliant sacrifice — takes the open g-file with the rook". The board
 * facts say what the sacrifice is for. */
function withoutFileDetail<T extends { type: TacticMotifType; detail?: string | null }>(claim: T): T {
  return claim.type === 'brilliantSacrifice' && claim.detail && /^takes the (half-)?open [a-h]-file/.test(claim.detail) ? { ...claim, detail: null } : claim;
}

/** The review's fork detail names squares ("knight on c6 forks b8, d8 and
 * a7"), empty ones and pawns included, which a script copies word for word.
 * The board facts name the forked pieces where it matters; the sentence keeps
 * its motif and gain. */
function withoutSquareFork<T extends { detail?: string | null }>(claim: T): T {
  return claim.detail && /\bforks [a-h][1-8]\b/.test(claim.detail) ? { ...claim, detail: null } : claim;
}

/** One move is clearly best, and it is the course move. */
/** The engine's best, and clearly: `onlyMoveGap` ahead of the second, or a
 * mate where the second mates later or not at all. A slower mate is no
 * second answer: the smothered-mate run flagged every move of a mate in 4. */
export function isQuizEligible(evaluation: EngineEval | undefined, san: string, side: 'white' | 'black'): boolean {
  const [first, second] = evaluation?.lines ?? [];
  if (!first || !second || first.moveSan !== san) return false;
  const mates = moverMateIn(first, side);
  if (mates !== null) {
    const next = moverMateIn(second, side);
    return next === null || next > mates;
  }
  const moverCp = (line: EngineLine): number => (side === 'white' ? 1 : -1) * toCpWhite(line);
  return winPctFor(side, toCpWhite(first)) - winPctFor(side, toCpWhite(second)) > CONFIG.courses.onlyMoveGap || moverCp(first) - moverCp(second) >= CONFIG.courses.onlyMoveCpGap;
}

/** Moves to mate for `side` on an engine line (White's view: positive is
 * White mating); null when it does not mate. */
export function moverMateIn(line: { mateIn: number | null }, side: 'white' | 'black'): number | null {
  if (line.mateIn === null || line.mateIn === 0 || (line.mateIn > 0) !== (side === 'white')) return null;
  return Math.abs(line.mateIn);
}
