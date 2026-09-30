/** The first move's number and whether Black plays it: a game starts at 1
 * with White; a course may start from any position. */
export interface MoveListStart {
  moveNumber: number;
  blackFirst: boolean;
}

export const GAME_START: MoveListStart = { moveNumber: 1, blackFirst: false };

/** The start of a move list from its starting FEN (side to move, move number). */
export function moveListStart(fen: string): MoveListStart {
  const [, turn, , , , fullmove] = fen.split(' ');
  return { moveNumber: Number(fullmove) || 1, blackFirst: turn === 'b' };
}
