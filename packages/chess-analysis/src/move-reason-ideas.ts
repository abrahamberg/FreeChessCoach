import type { Move } from 'chess.js';
import { capitalise, type EngineEval } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { moveIdeas, renderMoveIdea, type MoveIdea, type MoveIdeaKind } from './move-ideas/index.js';

/** What a move that cost something did wrong, among the ideas: said after
 * the fault notes, never instead of them. */
const FAULT_KINDS: ReadonlySet<MoveIdeaKind> = new Set([
  'weakensShield', 'shutsIn', 'opensEnemyLine', 'movesAgain', 'earlyQueen', 'blocksPawn', 'takesKnightSquare', 'losesCastling', 'givesUpCentre', 'leavesKing'
]);

export interface IdeaReasonsInput {
  fenBefore: string;
  moveSan: string;
  previous: readonly Move[];
  evalBefore: EngineEval;
  evalAfter?: EngineEval;
}

export function reviewIdeas(input: IdeaReasonsInput): MoveIdea[] {
  return moveIdeas({ fenBefore: input.fenBefore, san: input.moveSan, previous: input.previous, evalBefore: input.evalBefore, evalAfter: input.evalAfter });
}

/** The ideas a fine move's note shows, as sentences: the most telling first,
 * at most `CONFIG.moveReasons.maxIdeas`. `skip`: kinds another note already
 * says (a passed pawn the structural note named). */
export function ideaSentences(ideas: readonly MoveIdea[], skip: ReadonlySet<MoveIdeaKind> = new Set()): string[] {
  return ideas
    .filter((idea) => !skip.has(idea.kind))
    .slice(0, CONFIG.moveReasons.maxIdeas)
    .map((idea) => capitalise(renderMoveIdea(idea)));
}

/** The ideas that say what a costly move did wrong, as sentences; a small
 * fault (an inaccuracy, a miss) also keeps its point when it threatens or
 * stops something (34…Bxf2, a "miss" that threatens mate in two). */
export function faultIdeaSentences(ideas: readonly MoveIdea[], small: boolean): string[] {
  const point = small ? ideas.filter((idea) => POINT_KINDS.has(idea.kind)).slice(0, 1) : [];
  const faults = ideas.filter((idea) => FAULT_KINDS.has(idea.kind)).slice(0, CONFIG.moveReasons.maxFaultIdeas);
  return [...point, ...faults].map((idea) => capitalise(renderMoveIdea(idea)));
}

/** The fault is the story on a costly move (the owner's rule for pins and
 * kicks, Tasks 126.2–3); only a mate threatened or stopped, or a sound
 * sacrifice, is said beside it. */
const POINT_KINDS: ReadonlySet<MoveIdeaKind> = new Set(['threatensMate', 'stopsMate', 'sacrifices']);
