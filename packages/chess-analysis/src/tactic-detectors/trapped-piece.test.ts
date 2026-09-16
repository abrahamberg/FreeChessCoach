import { describe, expect, test } from 'vitest';
import { buildTacticDetectionContext } from './context.js';
import { trappedPieceDetector } from './trapped-piece.js';

/** White's knight on f4 covers neither of the a8 knight's flight squares
 * (b6, c7) yet, so nothing is trapped until it hops to d5. The rook on a1
 * already bears down the a-file. */
const TRAP_AVAILABLE_FEN = 'n6k/8/8/8/5N2/8/8/R3K3 w - - 0 1';
/** The same trap already complete, so a king move has nothing to do with
 * it — the case the shipped detector still reported. */
const TRAP_ALREADY_SET_FEN = 'n6k/8/8/3N4/8/8/8/R3K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('trappedPieceDetector', () => {
  test('claims the trap the move itself springs', () => {
    const [claim] = trappedPieceDetector.detect(buildTacticDetectionContext(TRAP_AVAILABLE_FEN, 'Nd5', 'white'));

    expect(claim).toMatchObject({ type: 'trappedPiece', actor: 'd5', targets: ['a8'], victim: 'a8', prize: 'knight' });
  });

  test('says nothing about a trap that was already there before the move', () => {
    // docs/tactics-rework.md §5 layer 1: every detector is move-scoped. The
    // shipped detector fired on any trapped piece anywhere on the board,
    // related to the move or not, which is why an unrelated king move used
    // to "find" this one.
    expect(trappedPieceDetector.detect(buildTacticDetectionContext(TRAP_ALREADY_SET_FEN, 'Kf1', 'white'))).toEqual([]);
  });

  test('does not flag a quiet developing move', () => {
    expect(trappedPieceDetector.detect(buildTacticDetectionContext(QUIET_FEN, 'e4', 'white'))).toEqual([]);
  });
});
