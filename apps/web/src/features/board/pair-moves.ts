import type { MoveListStart } from './moveListStart.js';

export interface MovePair {
  moveNumber: number;
  /** Absent on the first row when Black moves first ("1... e5"). */
  white?: { ply: number; san: string };
  black?: { ply: number; san: string };
}

/** The moves as numbered rows, White then Black; Black first when the list starts on Black's move. */
export function pairMoves(sanMoves: string[], start: MoveListStart): MovePair[] {
  const pairs: MovePair[] = [];
  const offset = start.blackFirst ? 1 : 0;
  for (let half = 0; half < sanMoves.length + offset; half += 2) {
    const whiteIndex = half - offset;
    const whiteSan = whiteIndex >= 0 ? sanMoves[whiteIndex] : undefined;
    const blackSan = sanMoves[whiteIndex + 1];
    if (whiteSan === undefined && blackSan === undefined) continue;
    pairs.push({
      moveNumber: start.moveNumber + half / 2,
      white: whiteSan === undefined ? undefined : { ply: whiteIndex + 1, san: whiteSan },
      black: blackSan === undefined ? undefined : { ply: whiteIndex + 2, san: blackSan }
    });
  }
  return pairs;
}
