import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { pinDetector } from './pin.js';

const PIN_FEN = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('pinDetector', () => {
  test('detects a pin-creating move', () => {
    expect(pinDetector.detect(buildTacticDetectionContext(PIN_FEN, 'Bb5', 'white'))).toBe(true);
  });

  test('does not flag a quiet developing move', () => {
    expect(pinDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toBe(false);
  });
});
