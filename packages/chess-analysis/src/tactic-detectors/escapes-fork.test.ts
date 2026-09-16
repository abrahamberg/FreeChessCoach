import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { escapesForkDetector } from './escapes-fork.js';

/** White's knight on d5 hits both black rooks; ...Rb8 saves one and ends the
 * double attack. */
const FORKED_ROOKS = '4k3/8/1r3r2/3N4/8/8/8/4K3 b - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('escapesForkDetector', () => {
  test('claims the double attack the move broke up', () => {
    const [claim] = escapesForkDetector.detect(buildTacticDetectionContext(FORKED_ROOKS, 'Rb8', 'black'));

    expect(claim).toMatchObject({ type: 'escapesFork', targets: ['b6', 'f6'], gainKind: 'safety' });
  });

  test('does not flag a quiet developing move', () => {
    expect(escapesForkDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
