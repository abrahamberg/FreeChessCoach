import type { EngineEval } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { moveIdeas, movesOfLine, type MoveIdea } from '../move-ideas/index.js';

/** The ideas of the course move: why it was played, as checked data. */
export function nodeIdeas(fenBefore: string, san: string, linePositionFens: readonly string[], evalsByFen: ReadonlyMap<string, EngineEval>, fenAfter: string): MoveIdea[] {
  return moveIdeas({
    fenBefore,
    san,
    previous: movesOfLine(linePositionFens.slice(0, -1)),
    evalBefore: evalsByFen.get(fenBefore),
    evalAfter: evalsByFen.get(fenAfter)
  }).slice(0, CONFIG.courses.ideasShown);
}

/** What one of the engine's other moves would have done, and the line it
 * leads to: "…Bd6 blocks the d-pawn". */
export function alternativeIdeas(fenBefore: string, san: string, linePositionFens: readonly string[]): MoveIdea[] {
  return moveIdeas({ fenBefore, san, previous: movesOfLine(linePositionFens.slice(0, -1)) }, 'does').slice(0, CONFIG.courses.alternativeIdeasShown);
}
