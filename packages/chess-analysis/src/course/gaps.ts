import { Chess } from 'chess.js';
import type { CourseDossier } from './dossier.js';
import { courseFenBefore } from './moves.js';
import type { CourseTree } from './tree.js';

/** `checkReply`: a way out of a check the learner gave. `engineBest`: the
 * engine's move where the lesson's line needs the opponent to go wrong. */
export type CourseGapReason = 'checkReply' | 'engineBest';

/** A move the opponent can play from a position of the course that the
 * course's tree has no line for. */
export interface CourseGap {
  reason: CourseGapReason;
  /** The node whose move reaches the position; null at the start. */
  afterNodeId: string | null;
  fenBefore: string;
  san: string;
  /** The position after the move: what the engine is asked about. */
  fen: string;
}

/**
 * What a course leaves unanswered, for whoever writes its PGN: the tree is
 * fixed once the course exists, and nothing adds a line later. The Stafford
 * course of 2026-10-13 taught 6…Bxf2+ 7.Kxf2 and had no line for 7.Ke2 or
 * 7.Kd2, the lesson's key choice. Two kinds, both the opponent's moves:
 * every legal answer to a learner's check that the tree continues past, and
 * the engine's best move where the course's opponent blunders or errs.
 */
export function courseGaps(tree: CourseTree, dossier: CourseDossier): CourseGap[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  // Where a move is played from: its parent, or, at a start, that start's position.
  const place = (parentId: string | null, fenBefore: string): string => parentId ?? `start:${fenBefore}`;
  const played = new Map<string, Set<string>>();
  for (const node of tree.nodes) {
    const key = place(node.parentId, courseFenBefore(byId, tree.startFen, node));
    played.set(key, (played.get(key) ?? new Set()).add(node.san));
  }
  const gaps = new Map<string, CourseGap>();
  const add = (reason: CourseGapReason, afterNodeId: string | null, san: string, fromFen: string): void => {
    const fenBefore = afterNodeId ? (byId.get(afterNodeId)?.fenAfter ?? tree.startFen) : fromFen;
    const key = `${fenBefore}|${san}`;
    if (played.get(place(afterNodeId, fenBefore))?.has(san) || gaps.has(key)) return;
    const board = new Chess(fenBefore);
    board.move(san);
    gaps.set(key, { reason, afterNodeId, fenBefore, san, fen: board.fen() });
  };
  for (const facts of dossier.nodes) {
    const node = byId.get(facts.nodeId);
    if (!node) continue;
    if (facts.side === dossier.learnerSide) {
      const board = new Chess(node.fenAfter);
      // A line that ends on the check has shown no answer at all: not a gap.
      if (board.inCheck() && played.has(node.id)) for (const san of board.moves()) add('checkReply', node.id, san, node.fenAfter);
    } else if (facts.bestInstead && (facts.quality === 'mistake' || facts.quality === 'blunder')) {
      add('engineBest', node.parentId, facts.bestInstead.san, courseFenBefore(byId, tree.startFen, node));
    }
  }
  return [...gaps.values()];
}
