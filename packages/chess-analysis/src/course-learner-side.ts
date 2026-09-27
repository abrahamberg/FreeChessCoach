import { Chess } from 'chess.js';
import type { CourseKind } from '@freechesscoach/shared';
import type { CourseTree } from './course-tree.js';

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * docs/courses.md §3: the learner side where code can tell it. A trap is
 * learned by the side that mates or comes out ahead in material at the end
 * of the line; a master game by the winner (`resultHeader`, else a mate on
 * the board). Null means the form asks: openings and tactics always do, and
 * so do a drawn game and a trap line that ends level.
 */
export function inferLearnerSide(kind: CourseKind, tree: CourseTree, resultHeader: string | null): 'white' | 'black' | null {
  const leafId = tree.lines[0]?.leafNodeId;
  const leaf = tree.nodes.find((node) => node.id === leafId);
  if (!leaf) return null;
  if (kind === 'trap') return mater(leaf.fenAfter) ?? materialLeader(tree.startFen, leaf.fenAfter);
  if (kind === 'master_game') {
    if (resultHeader === '1-0') return 'white';
    if (resultHeader === '0-1') return 'black';
    return resultHeader === '1/2-1/2' ? null : mater(leaf.fenAfter);
  }
  return null;
}

function mater(fen: string): 'white' | 'black' | null {
  const chess = new Chess(fen);
  if (!chess.isCheckmate()) return null;
  return chess.turn() === 'w' ? 'black' : 'white';
}

/** Whoever gained material between the start and the end of the line. */
function materialLeader(startFen: string, endFen: string): 'white' | 'black' | null {
  const gain = balance(endFen) - balance(startFen);
  if (gain > 0) return 'white';
  if (gain < 0) return 'black';
  return null;
}

/** White's material minus Black's. */
function balance(fen: string): number {
  let total = 0;
  for (const row of new Chess(fen).board()) {
    for (const cell of row) if (cell) total += (cell.color === 'w' ? 1 : -1) * (PIECE_VALUES[cell.type] ?? 0);
  }
  return total;
}
