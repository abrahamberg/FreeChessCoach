import type { Move } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { moveIdeas, type MoveIdea } from '../move-ideas/index.js';

/** The ideas of the move played: why it was played, as checked data.
 * `previous` is the game's moves before it. */
export function nodeIdeas(fenBefore: string, san: string, previous: readonly Move[], evalsByFen: ReadonlyMap<string, EngineEval>, fenAfter: string): MoveIdea[] {
  return moveIdeas({ fenBefore, san, previous, evalBefore: evalsByFen.get(fenBefore), evalAfter: evalsByFen.get(fenAfter) }).slice(0, CONFIG.courses.ideasShown);
}

/** What one of the engine's other moves would have done, and the line it
 * leads to: "…Bd6 blocks the d-pawn". */
export function alternativeIdeas(fenBefore: string, san: string, previous: readonly Move[]): MoveIdea[] {
  return moveIdeas({ fenBefore, san, previous }, 'does').slice(0, CONFIG.courses.alternativeIdeasShown);
}
