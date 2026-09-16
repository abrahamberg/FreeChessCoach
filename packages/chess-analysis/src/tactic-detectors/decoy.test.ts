import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { attractionSacDetector, decoyDetector } from './decoy.js';

/** Rd8+ can only be answered by Qxd8 — the king's flight squares are all
 * covered and d8 is guarded — and the queen lands where Nc6 forks it and the
 * a7 rook. */
const QUEEN_LURED = '1q2k3/r7/4P3/8/1N5B/8/8/3R2K1 w - - 0 1';
/** The same idea with nothing guarding d8, so it is the king that has to
 * take, and the knight forks the king and the rook. */
const KING_DRAGGED_OUT = '4k3/r7/8/5N2/1N6/1B6/8/3R2K1 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('decoyDetector', () => {
  test('claims a sacrifice that drags a piece onto a forking square', () => {
    const [claim] = decoyDetector.detect(buildTacticDetectionContext(QUEEN_LURED, 'Rd8+', 'white'));

    expect(claim).toMatchObject({ type: 'decoy', actor: 'd8', gainKind: 'tempo' });
  });

  test('leaves the king case to attractionSac', () => {
    expect(decoyDetector.detect(buildTacticDetectionContext(KING_DRAGGED_OUT, 'Rd8+', 'white'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(decoyDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('attractionSacDetector', () => {
  test('claims a sacrifice that drags the king out', () => {
    const [claim] = attractionSacDetector.detect(buildTacticDetectionContext(KING_DRAGGED_OUT, 'Rd8+', 'white'));

    expect(claim).toMatchObject({ type: 'attractionSac', actor: 'd8', gainKind: 'tempo' });
  });

  test('leaves the ordinary case to decoy', () => {
    expect(attractionSacDetector.detect(buildTacticDetectionContext(QUEEN_LURED, 'Rd8+', 'white'))).toEqual([]);
  });
});
