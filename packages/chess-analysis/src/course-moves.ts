import type { CourseNode } from '@freechesscoach/shared';

/** The position a course move is played from: its parent's, or the course's start. */
export function courseFenBefore(byId: ReadonlyMap<string, CourseNode>, startFen: string, node: CourseNode): string {
  return (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? startFen;
}

/** Who moves in this position. */
export function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** "6.Bc3" / "6…Bb4", from the position the move was played in; a prompt
 * spells Black's dots "...". */
export function moveLabel(fenBefore: string, san: string, blackDots = '…'): string {
  const fullmove = fenBefore.split(' ')[5] ?? '1';
  return `${fullmove}${sideToMove(fenBefore) === 'black' ? blackDots : '.'}${san}`;
}
