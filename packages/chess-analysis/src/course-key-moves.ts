import type { CourseSkeleton } from './course-skeleton.js';

/** Roles that speak over a card or about another move, never on their own moves. */
const NO_KEY_ROLES = new Set(['hook', 'safety', 'goal', 'recap']);

export interface EpisodeKeyMovesInput {
  role: string;
  /** The episode's moves, start to end. */
  path: readonly string[];
  answerNodeId: string | null;
  /** SAN per node id; a mate ("#") is always a key move. */
  sans: ReadonlyMap<string, string>;
  skeleton: CourseSkeleton | null;
}

/**
 * The moves of an episode that must speak in both the course and the clip:
 * the quiz answer, a mate, and for a trap its bait, answer and last move.
 * The first real run with budgets left 8…Qc1#, the move the whole trap
 * builds to, silent, because the planner gave the punish episode 3 of its 4
 * moves. Code sets these; the model's budgets are raised to fit them.
 */
export function episodeKeyMoves(input: EpisodeKeyMovesInput): string[] {
  if (NO_KEY_ROLES.has(input.role)) return [];
  const keys = new Set<string>();
  if (input.answerNodeId) keys.add(input.answerNodeId);
  const trap = input.skeleton?.kind === 'trap' ? input.skeleton : null;
  if (trap) {
    keys.add(trap.baitNodeId);
    if (trap.answerNodeId) keys.add(trap.answerNodeId);
    const end = trap.punishNodeIds[trap.punishNodeIds.length - 1];
    if (end) keys.add(end);
  }
  return input.path.filter((id) => keys.has(id) || input.sans.get(id)?.endsWith('#'));
}
