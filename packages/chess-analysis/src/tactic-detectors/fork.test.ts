import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { forkDetector } from './fork.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('forkDetector', () => {
  test('detects a fork-creating move', () => {
    expect(forkDetector.detect(buildTacticDetectionContext(FORK_FEN, 'Nd6+', 'white'))).not.toHaveLength(0);
  });

  test('does not flag a quiet developing move', () => {
    expect(forkDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });

  test('carries the squares the claim is made of, so the sentence and the arrow share one object', () => {
    // Nd6+ hits the king on e8 and the rook on b7 at once.
    const [claim, ...rest] = forkDetector.detect(buildTacticDetectionContext(FORK_FEN, 'Nd6+', 'white'));

    expect(rest).toEqual([]);
    expect(claim).toMatchObject({
      type: 'fork',
      actor: 'd6',
      targets: ['e8', 'b7'],
      victim: 'b7',
      gainKind: 'material',
      prize: 'rook'
    });
    expect(claim!.evidence.arrows).toEqual([
      { from: 'd6', to: 'e8' },
      { from: 'd6', to: 'b7' }
    ]);
  });

  test('proposes a double attack the old boolean gate rejected, and leaves the verdict to layer 2', () => {
    // Two defended pawns: the shipped `forks()` gate required a victim
    // worth more than the forker or undefended, so this never reached the
    // verifier at all. Detectors over-propose now — see types.ts.
    const DEFENDED_PAWNS = '4k3/8/1p1p4/1P1P4/8/8/8/K1N5 w - - 0 1';
    expect(forkDetector.detect(buildTacticDetectionContext(DEFENDED_PAWNS, 'Ne2', 'white'))).toEqual([]);
  });
});