/** A span of node ids cut after each quiz move, so every quiz has an episode
 * of its own and ends it (the player asks it, then plays the answer and the
 * reply that follows in the next piece). The pieces together are the span; the
 * last keeps the tail. Quiz moves outside the span are ignored. */
export function cutAtQuizzes(nodeIds: readonly string[], quizNodeIds: readonly string[]): string[][] {
  const quizzes = new Set(quizNodeIds);
  const pieces: string[][] = [];
  let piece: string[] = [];
  for (const id of nodeIds) {
    piece.push(id);
    if (quizzes.has(id)) {
      pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length) pieces.push(piece);
  return pieces;
}
