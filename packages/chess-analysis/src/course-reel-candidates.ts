import type { CourseDossier, CourseNodeFacts } from './course-dossier.js';
import type { CourseSkeleton } from './course-skeleton.js';
import type { CourseTree } from './course-tree.js';

/** docs/courses.md §13.3: at most this many moves before the climax, and after it. */
export const REEL_MOVES_BEFORE = 6;
export const REEL_MOVES_AFTER = 2;
/** A mate this close after the climax is the payoff: the reel runs to it
 * (the first real run ended a trap's reel two moves before its mate). */
export const REEL_MATE_REACH = 4;
const MAX_CANDIDATES = 5;
const SWING_WIN_DROP = 25;
const BRILLIANT = new Set(['brilliant', 'great']);

export type ReelStyle = 'highlight' | 'puzzle' | 'promo';
export type ReelReason = 'puzzle' | 'mate' | 'brilliant' | 'swing' | 'trap';

/** One idea a reel could be about: the climax and the moves around it. */
export interface ReelCandidate {
  id: string;
  reason: ReelReason;
  climaxNodeId: string;
  startNodeId: string;
  endNodeId: string;
  /** Styles that fit: a puzzle only where the climax is a forced, findable
   * move for the side that plays it; a promo needs a video (the caller). */
  styles: ReelStyle[];
}

/**
 * §13.3: the reel's candidates, best first — a puzzle's solution, a mate, a
 * brilliant or great move, a trap's punishment, a blunder that swings the
 * game. Each spans at most 6 moves before its climax and 2 after (up to 4
 * when that reaches a mate), on the climax's own line. The planner picks one; with none, there is no reel.
 */
export function reelCandidates(tree: CourseTree, dossier: CourseDossier, skeleton: CourseSkeleton | null): ReelCandidate[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const facts = new Map(dossier.nodes.map((node) => [node.nodeId, node]));
  const found: { reason: ReelReason; climax: CourseNodeFacts; rank: number }[] = [];
  const add = (reason: ReelReason, nodeId: string | null | undefined, rank: number): void => {
    const climax = nodeId ? facts.get(nodeId) : undefined;
    if (climax && !found.some((each) => each.climax.nodeId === climax.nodeId)) found.push({ reason, climax, rank });
  };

  if (skeleton?.kind === 'puzzle') add('puzzle', skeleton.learnerNodeIds[skeleton.learnerNodeIds.length - 1], 0);
  for (const node of dossier.nodes) if (node.san.endsWith('#')) add('mate', node.nodeId, 1);
  if (skeleton?.kind === 'trap') add('trap', skeleton.answerNodeId, 2);
  for (const node of dossier.nodes) if (BRILLIANT.has(node.quality)) add('brilliant', node.nodeId, 3);
  for (const node of [...dossier.nodes].sort((a, b) => b.winDrop - a.winDrop)) if (node.winDrop >= SWING_WIN_DROP) add('swing', node.nodeId, 4);

  const puzzleStart = skeleton?.kind === 'puzzle' ? tree.nodes.find((node) => node.parentId === null)?.id : undefined;
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_CANDIDATES)
    .map(({ reason, climax }, index) => {
      const before = ancestors(byId, climax.nodeId).slice(-REEL_MOVES_BEFORE);
      const reach = descendants(tree, climax.nodeId, REEL_MATE_REACH);
      const mate = reach.findIndex((nodeId) => byId.get(nodeId)?.san.endsWith('#'));
      const after = mate >= 0 ? reach.slice(0, mate + 1) : reach.slice(0, REEL_MOVES_AFTER);
      const findable = reason === 'puzzle' || climax.quizEligible || climax.san.endsWith('#');
      return {
        id: `r${index + 1}`,
        reason,
        climaxNodeId: climax.nodeId,
        startNodeId: reason === 'puzzle' && puzzleStart ? puzzleStart : (before[0] ?? climax.nodeId),
        endNodeId: after[after.length - 1] ?? climax.nodeId,
        styles: findable ? ['highlight', 'puzzle', 'promo'] : ['highlight', 'promo']
      };
    });
}

/** The moves before `nodeId` on its line, root first, not including it. */
function ancestors(byId: ReadonlyMap<string, CourseTree['nodes'][number]>, nodeId: string): string[] {
  const path: string[] = [];
  for (let parent = byId.get(nodeId)?.parentId; parent; parent = byId.get(parent)?.parentId ?? null) path.unshift(parent);
  return path;
}

/** Up to `count` moves after `nodeId`, following the first child. */
function descendants(tree: CourseTree, nodeId: string, count: number): string[] {
  const path: string[] = [];
  let current = nodeId;
  for (let step = 0; step < count; step += 1) {
    const next = tree.nodes.find((node) => node.parentId === current);
    if (!next) break;
    path.push(next.id);
    current = next.id;
  }
  return path;
}
