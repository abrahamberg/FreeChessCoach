import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { discoveredAttackDetector } from './discovered-attack.js';

const DISCOVERY_FEN = 'k7/8/8/N7/8/8/8/R3K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('discoveredAttackDetector', () => {
  test('detects a discovered check', () => {
    expect(discoveredAttackDetector.detect(buildTacticDetectionContext(DISCOVERY_FEN, 'Nb3', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(discoveredAttackDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
