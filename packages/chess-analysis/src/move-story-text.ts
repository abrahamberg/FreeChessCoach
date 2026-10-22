import { renderMoveIdea, type MoveIdea } from './move-ideas/index.js';

/** One of the engine's moves in words, the same in Game Review and the
 * dossier: "Bd6 (blocks the pawn on d7): Black is slightly worse, after d4
 * exd4 cxd4". */
export function alternativeText(alt: { san: string; verdict: string; ideas: readonly MoveIdea[]; line: readonly string[] }): string {
  const ideas = alt.ideas.length ? ` (${alt.ideas.map(renderMoveIdea).join('; ')})` : '';
  const line = alt.line.length ? `, after ${alt.line.join(' ')}` : '';
  return `${alt.san}${ideas}: ${alt.verdict}${line}`;
}
