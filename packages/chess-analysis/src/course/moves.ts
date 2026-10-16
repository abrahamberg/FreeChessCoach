/** The position a course move is played from: its parent's, else (a root
 * move) the start of its own example, else the course's start. */
export function courseFenBefore(byId: ReadonlyMap<string, { fenAfter: string }>, startFen: string, node: { parentId: string | null; startFen?: string }): string {
  return (node.parentId ? byId.get(node.parentId)?.fenAfter : undefined) ?? node.startFen ?? startFen;
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
