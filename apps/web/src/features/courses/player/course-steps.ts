import type { CourseArrow, CourseDocument, CourseEpisode, CourseNode, MoveQuality } from '@freechesscoach/shared';
import { episodeNodeIds, fenBefore } from '../courseEdits.js';

/** One episode as the learner walks it: the position before its first move,
 * then one step per move. Step `k` shows the board after `moves[k - 1]`. */
export interface EpisodeWalk {
  startFen: string;
  moves: CourseNode[];
  /** The step at which the quiz asks for `moves[quizAt]`; null without a quiz. */
  quizAt: number | null;
}

export function episodeWalk(document: CourseDocument, episode: CourseEpisode): EpisodeWalk {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const moves = episodeNodeIds(document, episode).flatMap((id) => byId.get(id) ?? []);
  const first = moves[0];
  const quizAt = episode.quiz ? moves.findIndex((node) => node.id === episode.quiz!.answerNodeId) : -1;
  return { startFen: first ? fenBefore(document, first) : document.startFen, moves, quizAt: quizAt < 0 ? null : quizAt };
}

/** The board and words at a step: the move just played, its line when it
 * speaks in the course, and its arrows (the move's own, else the creator's
 * from the PGN). */
export function stepView(episode: CourseEpisode, walk: EpisodeWalk, step: number): { fen: string; move: CourseNode | null; note: string | null; arrows: CourseArrow[] } {
  const move = step > 0 ? (walk.moves[step - 1] ?? null) : null;
  if (!move) return { fen: walk.startFen, move: null, note: null, arrows: [] };
  const ply = episode.plies.find((each) => each.nodeId === move.id);
  return { fen: move.fenAfter, move, note: (ply?.course && ply.text.trim()) || null, arrows: ply?.arrows.length ? ply.arrows : move.arrows };
}

/** §11: a move the engine rates about as good as the course's is accepted,
 * with no penalty. The same tiers the classifier gives a move within a
 * couple of win-% points of the best. */
const ACCEPTED: ReadonlySet<MoveQuality> = new Set(['brilliant', 'great', 'best', 'excellent']);

export function isAcceptedAlternative(quality: MoveQuality): boolean {
  return ACCEPTED.has(quality);
}

/** The note with the move's own name blanked out ("2...Nc6 hits e5" → "…
 * hits e5"), so a hidden move is not given away; a whole move only, never
 * part of another ("e5" in "Qxe5"). With no move, the note as it is. */
export function withoutMove(note: string | null, san: string | null): string | null {
  if (!note || !san) return note;
  const escaped = san.replace(/[+#!?]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return note.replace(new RegExp(`(?<![\\w.…])(?:\\d+(?:\\.\\.\\.|…|\\.)\\s*)?${escaped}[+#!?]*(?![\\w])`, 'g'), '…');
}
