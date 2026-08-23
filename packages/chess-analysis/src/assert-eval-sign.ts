import type { EngineLine } from '@freechesscoach/shared';

/**
 * Verifies that engine centipawn scores are stored from White's perspective.
 * Engine lines are best-first for the side to move, so White minimizes the
 * score order while Black maximizes it.
 *
 * Terminal positions have no legal moves, and mate lines may not have a
 * centipawn score. Neither shape provides two comparable values to check.
 */
export function assertEvalSignConvention(fen: string, lines: EngineLine[]): void {
  const sideToMove = readSideToMove(fen);
  const firstLine = lines[0];
  const secondLine = lines[1];

  if (!firstLine || !secondLine || firstLine.cp === null || secondLine.cp === null) return;

  const isCorrectlyOrdered =
    sideToMove === 'white' ? firstLine.cp >= secondLine.cp : firstLine.cp <= secondLine.cp;
  if (isCorrectlyOrdered) return;

  const expectedOrder = sideToMove === 'white' ? 'greater than or equal to' : 'less than or equal to';
  throw new Error(
    `Engine eval sign convention violation for ${sideToMove}-to-move FEN "${fen}": ` +
      `first line cp ${firstLine.cp} must be ${expectedOrder} to second line cp ${secondLine.cp}`
  );
}

function readSideToMove(fen: string): 'white' | 'black' {
  const sideToMove = fen.trim().split(/\s+/)[1];
  if (sideToMove === 'w') return 'white';
  if (sideToMove === 'b') return 'black';
  throw new Error(`Cannot assert engine eval sign convention: invalid FEN side-to-move field in "${fen}"`);
}
