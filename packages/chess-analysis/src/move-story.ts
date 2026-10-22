import { Chess, type Move } from 'chess.js';
import { capitalise, type EngineEval, type MovePhase, type MoveQuality, type TacticMotifType } from '@freechesscoach/shared';
import type { ClassifiedMove } from './classify.js';
import { CONFIG } from './config.js';
import { abandonedGuard, betterMoveFacts, replyFork } from './board-facts/better-move.js';
import { boardFacts } from './board-facts/move-facts.js';
import { isOnlyMove } from './board-facts/only-move.js';
import type { BoardFact } from './board-facts/types.js';
import { lineWords, positionWords } from './board-facts/verdict-words.js';
import { lineBalance, settledLine } from './board-facts/material.js';
import { bookMovesForFen, isBookMoveFrom, resolveOpening } from './opening-book.js';
import { lineChanges, type LineChange } from './piece-coordination.js';
import { positionKey } from './opening-book-key.js';
import { tacticAllowedReason, tacticOpportunityReason } from './tactic-reason-text.js';
import { movesOfLine, renderMoveIdea, type MoveIdea } from './move-ideas/index.js';
import { alternativeIdeas, nodeIdeas } from './course/dossier-ideas.js';
import { tacticCardTexts } from './review-move-texts.js';

/**
 * Everything checked about one move, as data: what Game Review and the
 * course dossier both say about it (`docs/move-story.md`). Each renders it
 * in its own words; neither knows a fact the other does not.
 */
export interface MoveStory {
  san: string;
  side: 'white' | 'black';
  moveNumber: number;
  quality: MoveQuality;
  /** White's view after the move, mate clamped (classify.ts): the eval bar and graph. */
  evalAfterCp: number;
  /** The position before and after, in words. */
  before: string;
  after: string;
  inBook: boolean;
  openingName: string | null;
  /** The opening book's other moves from the position before, each with the
   * name it leads to: where the Stafford's 3…Nc6 leaves the Petrov, the
   * usual 3…d6 and 3…Nxe4. */
  bookSiblings: { san: string; name: string }[];
  /** The mover's bishops, rooks and queens the move gives squares to: the
   * Stafford's 4…dxc6 opens the bishop on c8 that mates on g4. */
  opens: LineChange[];
  /** The engine sees a forced mate after the move: a sentence about winning material would undersell it. */
  mateAhead: boolean;
  /** The engine's best move and line (at most 6 plies) when the move is not
   * it, with its board facts (`betterMoveFacts`) and the material at the
   * line's end ("White is a pawn up"). */
  bestInstead: { san: string; line: string[]; board: BoardFact[]; balance: string } | null;
  board: BoardFact[];
  /** Why the move was played (`move-ideas/`): what it threatens and stops,
   * develops, controls, opens, prepares, most telling first. */
  ideas: MoveIdea[];
  /** Checked tactic sentences (`tactic-reason-text.ts`), the reader = "you".
   * Not the review's prevention sentences ("you stopped them winning a
   * bishop through a fork"): about a move nobody played, the model presented
   * them as the point of the move. */
  tactics: string[];
  /** The motif the move plays, when the detectors found one. */
  motif: TacticMotifType | null;
  /** The engine's other top moves, in words, each with what it would do
   * and the engine's line after it. None for a move that is checkmate. */
  alternatives: { san: string; verdict: string; ideas: MoveIdea[]; line: string[] }[];
  /** Game Review's own notes (`move-reasons.ts`) that nothing above says:
   * a piece left loose, a capture or mate missed, a fork allowed, the trade,
   * the opening principle, the only move. */
  notes: string[];
  /** The only move that keeps the position (`isOnlyMove`). */
  onlyMove: boolean;
  /** The mover's win% drop and the game phase. */
  winDrop: number;
  phase: MovePhase | null;
  /** The position is a teaching setup with no engine verdict (the course's
   * `@noeval`): `before`, `after`, `alternatives`, `bestInstead` and
   * `mateAhead` are empty; what the moves do stays. */
  noEvaluation: boolean;
}

export interface MoveStoryInput {
  move: ClassifiedMove;
  fenBefore: string;
  fenAfter: string;
  /** The game's positions from the start up to and including the one after the move. */
  linePositionFens: string[];
  /** The game's moves before this one, when the caller has them (else found from the positions). */
  previous?: readonly Move[];
  evalsByFen: ReadonlyMap<string, EngineEval>;
  /** The reader's own move: tactic sentences say "you". */
  isReaderMove: boolean;
  noEvaluation: boolean;
}

export function buildMoveStory(input: MoveStoryInput): MoveStory {
  const { move, fenBefore, fenAfter, evalsByFen, noEvaluation } = input;
  const evalBefore = evalsByFen.get(fenBefore);
  const opening = resolveOpening(input.linePositionFens.map(positionKey));
  const reply = evalsByFen.get(fenAfter)?.lines[0]?.moveSan;
  const previous = input.previous ?? movesOfLine(input.linePositionFens.slice(0, -1));
  const ideas = nodeIdeas(fenBefore, move.moveSan, previous, noEvaluation ? new Map() : evalsByFen, fenAfter);
  return {
    san: move.moveSan,
    side: move.mover,
    moveNumber: Number(fenBefore.split(' ')[5] ?? 1),
    quality: move.quality,
    evalAfterCp: move.evalAfterCp,
    before: noEvaluation ? '' : positionWords(fenBefore, evalBefore),
    after: noEvaluation ? '' : positionWords(fenAfter, evalsByFen.get(fenAfter)),
    inBook: isBookMoveFrom(fenBefore, move.moveSan),
    openingName: opening?.name ?? null,
    bookSiblings: bookMovesForFen(fenBefore).filter((entry) => entry.san !== move.moveSan).map(({ san, name }) => ({ san, name })),
    opens: opened(fenBefore, move.moveSan),
    mateAhead: !noEvaluation && (evalsByFen.get(fenAfter)?.lines[0]?.mateIn ?? null) !== null,
    bestInstead: noEvaluation ? null : bestInstead(move, fenBefore),
    board: [...boardFacts(fenBefore, move.moveSan), ...abandonedGuard(fenBefore, move.moveSan, reply), ...replyFork(fenAfter, reply), ...repetition(fenAfter, input.linePositionFens)],
    ideas,
    tactics: tacticSentences(move, input.isReaderMove),
    motif: move.tacticOpportunity?.found ? move.tacticOpportunity.type : null,
    alternatives: noEvaluation ? [] : alternatives(evalBefore, move.moveSan, fenBefore, fenAfter, previous),
    notes: reviewOnlyNotes(move, ideas),
    onlyMove: isOnlyMove(evalBefore, move.moveSan, move.mover),
    winDrop: move.drop ?? 0,
    phase: move.phase ?? null,
    noEvaluation
  };
}

/** A game's moves, each with its story: Game Review's, from the game's own
 * evals (`positionFens[i]` is the position before ply i + 1). A move whose
 * position is missing keeps no story. */
export function withMoveStories(moves: readonly ClassifiedMove[], positionFens: readonly string[], evals: readonly EngineEval[]): ClassifiedMove[] {
  const evalsByFen = new Map(evals.map((each) => [each.fen, each]));
  const history = movesOfLine(positionFens);
  return moves.map((move) => {
    const fenBefore = positionFens[move.ply - 1];
    const fenAfter = positionFens[move.ply];
    if (!fenBefore || !fenAfter) return move;
    const story = buildMoveStory({ move, fenBefore, fenAfter, linePositionFens: positionFens.slice(0, move.ply + 1), previous: history.slice(0, move.ply - 1), evalsByFen, isReaderMove: move.isUserMove, noEvaluation: false });
    return { ...move, story: story as unknown as Record<string, unknown> };
  });
}

/** Out of a check every piece gains squares it only lacked because of the
 * check: 8.Ke2 "opened" the bishop on d8. */
function opened(fenBefore: string, san: string): LineChange[] {
  const board = new Chess(fenBefore);
  if (board.inCheck()) return [];
  return lineChanges(fenBefore, board.move(san), 'opens');
}

/** After a checkmate the mate is the whole description: 38…Rc1# listed
 * "Rxd2+: Black is much better" and "Ra2: Black is much better" (the owner's
 * calibration, 2026-10-01). */
function alternatives(evalBefore: EngineEval | undefined, san: string, fenBefore: string, fenAfter: string, previous: readonly Move[]): MoveStory['alternatives'] {
  if (new Chess(fenAfter).isCheckmate()) return [];
  if (!evalBefore) return [];
  return evalBefore.lines
    .filter((line) => line.moveSan !== san)
    .map((line) => ({
      san: line.moveSan,
      verdict: lineWords(line, evalBefore),
      ideas: alternativeIdeas(fenBefore, line.moveSan, previous),
      line: (line.pvSan ?? []).slice(1, 1 + CONFIG.courses.alternativeLinePlies)
    }));
}

/** A perpetual check is a position that comes back: the perpetual's
 * 6.Qe8+ is 4.Qe8+ again, which no board fact said. */
function repetition(fenAfter: string, linePositionFens: readonly string[]): BoardFact[] {
  const key = positionKey(fenAfter);
  const times = linePositionFens.filter((fen) => positionKey(fen) === key).length;
  if (times >= 3) return [{ kind: 'repetition', times: 3 }];
  return times === 2 ? [{ kind: 'repetition', times: 2 }] : [];
}

function bestInstead(move: ClassifiedMove, fenBefore: string): MoveStory['bestInstead'] {
  const best = move.bestMoveSan ?? move.bestLineSan[0];
  if (!best || best === move.moveSan) return null;
  const line = move.bestLinePvSan?.length ? move.bestLinePvSan : move.bestLineSan;
  const shown = settledLine(fenBefore, line.slice(0, CONFIG.courses.bestLinePlies));
  return { san: best, line: shown, board: betterMoveFacts(fenBefore, move.moveSan, best), balance: lineBalance(fenBefore, shown) };
}

function tacticSentences(move: ClassifiedMove, isReaderMove: boolean): string[] {
  const sentences: string[] = [];
  if (move.tacticOpportunity) sentences.push(tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove: isReaderMove }, move.bestMoveSan));
  if (move.tacticAllowed) sentences.push(tacticAllowedReason({ ...move.tacticAllowed, isUserMove: isReaderMove }));
  return sentences;
}

/** Game Review's notes less what the story says already: a book move's
 * theory line, the tactic cards' sentences, and the ideas' own sentences. */
function reviewOnlyNotes(move: ClassifiedMove, ideas: readonly MoveIdea[]): string[] {
  const said = new Set([...Object.values(tacticCardTexts(move)).filter((text): text is string => text !== null), ...ideas.map((idea) => capitalise(renderMoveIdea(idea)))]);
  const reasons = move.quality === 'book' ? (move.reasons ?? []).slice(1) : (move.reasons ?? []);
  return reasons.filter((reason) => !said.has(reason));
}
