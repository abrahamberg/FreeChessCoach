import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { kingSafetyDetector } from './king-safety.js';

const CAN_CASTLE = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPPBPPP/RNBQK2R w KQkq - 0 4';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('kingSafetyDetector', () => {
  test('claims castling', () => {
    const [claim] = kingSafetyDetector.detect(buildTacticDetectionContext(CAN_CASTLE, 'O-O', 'white'));

    expect(claim).toMatchObject({ type: 'kingSafety', actor: 'g1', gainKind: 'positional' });
  });

  test('does not flag a quiet pawn move', () => {
    expect(kingSafetyDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
