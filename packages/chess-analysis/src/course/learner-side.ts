import { Chess } from 'chess.js';
import type { CourseKind } from '@freechesscoach/shared';
import type { CourseTree } from './tree.js';


/**
 * docs/courses.md §3: the learner side where code can tell it. A trap is
 * learned by the side that plays the line's last move; a master game by the
 * winner (`resultHeader`, else a mate on the board). Null means the form
 * asks: openings and tactics always do, and so does a drawn game. A puzzle
 * is played by the side to move in its position, and so is an endgame's
 * technique.
 */
export function inferLearnerSide(kind: CourseKind, tree: CourseTree, resultHeader: string | null): 'white' | 'black' | null {
  const leafId = tree.lines[0]?.leafNodeId;
  const leaf = tree.nodes.find((node) => node.id === leafId);
  if (!leaf) return null;
  // A trap line ends on the trapper's blow: the side that moves last. The
  // material at the end misread the Fishing Pole (…g3, White a knight up and
  // mated next move) and the QGA's 6.Qf3 (the rook falls next move).
  if (kind === 'trap') return new Chess(leaf.fenAfter).turn() === 'w' ? 'black' : 'white';
  if (kind === 'puzzle' || kind === 'endgame') return new Chess(tree.startFen).turn() === 'w' ? 'white' : 'black';
  if (kind === 'master_game') {
    if (resultHeader === '1-0') return 'white';
    if (resultHeader === '0-1') return 'black';
    return resultHeader === '1/2-1/2' ? null : mater(leaf.fenAfter);
  }
  return null;
}

/** docs/courses.md §13.2: a puzzle is a position (`[FEN]`) and one line,
 * its solution, played by the side to move. Empty when the PGN is one. */
export function puzzleShapeProblems(tree: CourseTree): string[] {
  const problems: string[] = [];
  if (tree.startFen === new Chess().fen()) problems.push('A puzzle starts from a position: add its [FEN] header');
  if (tree.lines.length > 1) problems.push('A puzzle has one solution line: remove the sidelines');
  return problems;
}

/** Phase 103: an endgame is a position (`[FEN]`); its sidelines are the
 * defender's tries. Empty when the PGN is one. */
export function endgameShapeProblems(tree: CourseTree): string[] {
  return tree.startFen === new Chess().fen() ? ['An endgame starts from a position: add its [FEN] header'] : [];
}

function mater(fen: string): 'white' | 'black' | null {
  const chess = new Chess(fen);
  if (!chess.isCheckmate()) return null;
  return chess.turn() === 'w' ? 'black' : 'white';
}
