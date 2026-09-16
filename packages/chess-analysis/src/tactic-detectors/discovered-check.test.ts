import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { discoveredCheckDetector } from './discovered-check.js';

/** The knight on e4 stands between the rook on e1 and the king on e8; Nc5+
 * gives no check of its own, so the check comes from the unveiled rook. */
const DISCOVERED_CHECK = '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1';
/** An ordinary check by the piece that moved. */
const PLAIN_CHECK = '4k3/8/8/8/8/8/8/R5K1 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('discoveredCheckDetector', () => {
  test('names the piece that gives the check, not the one that moved', () => {
    const [claim] = discoveredCheckDetector.detect(buildTacticDetectionContext(DISCOVERED_CHECK, 'Nc5+', 'white'));

    expect(claim).toMatchObject({ type: 'discoveredCheck', actor: 'e1', targets: ['e8'], gainKind: 'tempo' });
  });

  test('says nothing about a check delivered by the moving piece', () => {
    expect(discoveredCheckDetector.detect(buildTacticDetectionContext(PLAIN_CHECK, 'Ra8+', 'white'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(discoveredCheckDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
