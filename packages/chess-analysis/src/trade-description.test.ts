import { describe, expect, test } from 'vitest';
import { describeTrade } from './trade-description.js';

/** Scotch Opening after 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4: Black to move,
 * with ...Nxd4 the natural trade and White's knight on d4 defended by the
 * queen on d1. */
const SCOTCH_AFTER_NXD4 = 'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4';
/** The same position one ply on: White has just been taken on d4 and
 * recaptures. */
const SCOTCH_AFTER_NXD4_BLACK = 'r1bqkbnr/pppp1ppp/8/8/3nP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5';
/** A knight on d4 nobody defends. */
const LOOSE_KNIGHT = '4k3/8/2n5/8/3N4/8/8/4K3 b - - 0 1';

describe('describeTrade', () => {
  test('names the recapture', () => {
    expect(describeTrade({ fenBefore: SCOTCH_AFTER_NXD4_BLACK, moveSan: 'Qxd4', isRecapture: true })).toBe(
      'Recaptures the knight on d4'
    );
  });

  test('names an even trade of like pieces', () => {
    expect(describeTrade({ fenBefore: SCOTCH_AFTER_NXD4, moveSan: 'Nxd4', isRecapture: false })).toBe(
      'Trades knights on d4'
    );
  });

  test('says nothing about a capture that simply wins the piece', () => {
    // Winning material is the tactic detectors' sentence, not a trade note.
    expect(describeTrade({ fenBefore: LOOSE_KNIGHT, moveSan: 'Nxd4', isRecapture: false })).toBeNull();
  });

  test('says nothing about a move that captures nothing', () => {
    expect(describeTrade({ fenBefore: SCOTCH_AFTER_NXD4, moveSan: 'Nf6', isRecapture: false })).toBeNull();
  });

  test('says nothing about a move that cannot be played', () => {
    expect(describeTrade({ fenBefore: SCOTCH_AFTER_NXD4, moveSan: 'Qxh8', isRecapture: false })).toBeNull();
  });
});
