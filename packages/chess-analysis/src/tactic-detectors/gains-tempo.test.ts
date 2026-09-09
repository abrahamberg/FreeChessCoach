import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { gainsTempoDetector } from './gains-tempo.js';

/** A pawn hitting a queen — the clearest tempo gain there is, and the one the
 * shipped vocabulary printed "Nothing to flag" for (TR-06). */
const PAWN_HITS_QUEEN = '4k3/8/8/8/3q4/8/2P5/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('gainsTempoDetector', () => {
  test('claims the piece the move chased, and claims no material for it', () => {
    const [claim] = gainsTempoDetector.detect(buildTacticDetectionContext(PAWN_HITS_QUEEN, 'c3', 'white'));

    expect(claim).toMatchObject({ type: 'gainsTempo', actor: 'c3', targets: ['d4'], gainKind: 'tempo', expectedGain: 0 });
  });

  test('does not flag a quiet developing move', () => {
    expect(gainsTempoDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
