import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { windmillDetector } from './windmill.js';

/** Rxh7+ takes with check from the b2 bishop, the king has only g8, and the
 * rook swings straight back to g7 with check — one turn of the grinder. */
const GRINDER = '7k/1r4Rp/6P1/8/8/8/1B6/6K1 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('windmillDetector', () => {
  test('claims a capturing discovered check the same piece can repeat', () => {
    const [claim] = windmillDetector.detect(buildTacticDetectionContext(GRINDER, 'Rxh7+', 'white'));

    expect(claim).toMatchObject({ type: 'windmill', actor: 'h7' });
  });

  test('does not flag a quiet developing move', () => {
    expect(windmillDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
