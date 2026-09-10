import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { desperadoDetector } from './desperado.js';

/** The bishop on a1 is attacked by the b2 pawn and its only move lands on a
 * square the d3 knight covers — it is lost either way, so it takes the pawn
 * with it. */
const DOOMED_BISHOP = '7k/8/8/8/8/1p1n4/1p6/B6K w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('desperadoDetector', () => {
  test('claims what a doomed piece took on its way out', () => {
    const [claim] = desperadoDetector.detect(buildTacticDetectionContext(DOOMED_BISHOP, 'Bxb2', 'white'));

    expect(claim).toMatchObject({ type: 'desperado', actor: 'b2', prize: 'pawn', gainKind: 'material' });
  });

  test('does not flag a quiet developing move', () => {
    expect(desperadoDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
