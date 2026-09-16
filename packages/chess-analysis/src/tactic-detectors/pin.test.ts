import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { pinDetector } from './pin.js';

const PIN_FEN = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// The queen on d1 already pins the knight to the rook behind it.
const STANDING_PIN_FEN = '3r4/8/8/3n4/8/7k/8/K2Q4 w - - 0 1';
// The bishop's long diagonal onto the knight (and the king behind it) is
// blocked by White's own pawn on d4, so advancing that pawn creates the pin.
const DISCOVERED_PIN_FEN = '7k/8/5n2/8/3P4/8/1B6/K7 w - - 0 1';

describe('pinDetector', () => {
  test('detects a pin-creating move', () => {
    expect(pinDetector.detect(buildTacticDetectionContext(PIN_FEN, 'Bb5', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(pinDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });

  test('does not re-report a standing pin when the pinner only slides along its own line', () => {
    // Qd1-d2 keeps pinning d5 to d8 from a different square on the same file.
    // The bind is identical before and after, so the move discovered nothing.
    expect(pinDetector.detect(buildTacticDetectionContext(STANDING_PIN_FEN, 'Qd2', 'white'))).toEqual([]);
  });

  test('still reports a pin uncovered by moving the piece that blocked it', () => {
    expect(pinDetector.detect(buildTacticDetectionContext(DISCOVERED_PIN_FEN, 'd5', 'white'))).not.toHaveLength(0);
  });
});
