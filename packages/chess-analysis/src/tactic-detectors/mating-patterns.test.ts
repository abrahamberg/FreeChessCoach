import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { matingNetDetector, smotheredMateDetector } from './mating-patterns.js';

/** The king on h8 is boxed in by its own rook and pawns; Nf7 is mate with
 * nothing else on the board doing any work. */
const SMOTHERED = '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1';
/** Ra7 isn't check, but the king's only move walks into Rb8 mate. */
const NET_CLOSING = '7k/8/8/8/8/8/8/RR5K w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('smotheredMateDetector', () => {
  test('claims a knight mate against a king walled in by its own pieces', () => {
    const [claim] = smotheredMateDetector.detect(buildTacticDetectionContext(SMOTHERED, 'Nf7#', 'white'));

    expect(claim).toMatchObject({ type: 'smotheredMate', actor: 'f7', targets: ['h8'], gainKind: 'mate' });
  });

  test('does not flag a quiet developing move', () => {
    expect(smotheredMateDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});

describe('matingNetDetector', () => {
  test('claims a move after which every legal answer runs into mate', () => {
    const [claim] = matingNetDetector.detect(buildTacticDetectionContext(NET_CLOSING, 'Ra7', 'white'));

    expect(claim).toMatchObject({ type: 'matingNet', actor: 'a7', gainKind: 'mate' });
  });

  test('does not flag a quiet developing move', () => {
    // The opening position leaves twenty replies, which `forcedReplies`
    // declines to enumerate at all — a net has to actually be a net.
    expect(matingNetDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
