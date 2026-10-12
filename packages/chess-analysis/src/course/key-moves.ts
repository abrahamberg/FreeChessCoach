import type { CourseGlyph, CourseMark } from '@freechesscoach/shared';
import type { CourseSkeleton } from './skeleton.js';

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
  /** What the creator marked, per node id (the dossier's facts fit). */
  creator?: ReadonlyMap<string, { creatorMarks: readonly CourseMark[]; creatorGlyph: CourseGlyph | null }>;
}

/** `@key`, or a `!`/`!!` glyph: the creator says this move is the point (M4). */
function isCreatorKey(input: EpisodeKeyMovesInput, id: string): boolean {
  const creator = input.creator?.get(id);
  return Boolean(creator && (creator.creatorMarks.includes('key') || creator.creatorGlyph === '!' || creator.creatorGlyph === '!!'));
}

/**
 * The moves of an episode that must speak in both the course and the clip:
 * the quiz answer, a mate, and for a trap its bait, answer and last move.
 * The first real run with budgets left 8…Qc1#, the move the whole trap
 * builds to, silent, because the planner gave the punish episode 3 of its 4
 * moves. Code sets these; the model's budgets are raised to fit them. The
 * creator's `@key` moves join them; a mate the creator marked `@fast` does not.
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
  return input.path.filter((id) => keys.has(id) || isCreatorKey(input, id) || (input.sans.get(id)?.endsWith('#') && !input.creator?.get(id)?.creatorMarks.includes('fast')));
}
