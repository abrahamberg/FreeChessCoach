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
/** The owner's game d9716668 after 4.Bg5 h6: the bishop takes the knight on
 * f6 and the queen takes back. */
const BISHOP_FOR_KNIGHT = 'rnbqkb1r/ppp2pp1/5n1p/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR w KQkq - 0 5';
/** A pawn on e5 held by a pawn: the knight that takes it is lost for it. */
const DEFENDED_PAWN = '4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1';
/** A pawn on e5 nobody holds. */
const LOOSE_PAWN = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1';

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

  // A bishop is 330 and a knight 320 on `see.ts`'s scale, so the exchange
  // comes out ten points off level, which is still level.
  test('names a bishop given for a knight', () => {
    expect(describeTrade({ fenBefore: BISHOP_FOR_KNIGHT, moveSan: 'Bxf6', isRecapture: false })).toBe(
      'Trades the bishop for the knight on f6'
    );
  });

  test('says nothing about a capture that loses a piece for a pawn', () => {
    expect(describeTrade({ fenBefore: DEFENDED_PAWN, moveSan: 'Nxe5', isRecapture: false })).toBeNull();
  });

  test('says nothing about a capture that wins a pawn', () => {
    expect(describeTrade({ fenBefore: LOOSE_PAWN, moveSan: 'Nxe5', isRecapture: false })).toBeNull();
  });

  test('says nothing about the first capture of a longer exchange (the Opera game, 13.Rxd7)', () => {
    // Rxd7 Rxd7 Bxd7+ Nxd7: level in the end, and no rook traded for a knight.
    const opera = '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 0 13';
    expect(describeTrade({ fenBefore: opera, moveSan: 'Rxd7', isRecapture: false })).toBeNull();
  });

  test('en passant is a trade only when the pawn can be taken back', () => {
    // 10.exd6 with …Bxd6 or …cxd6 to follow.
    expect(describeTrade({ fenBefore: 'r1bqkb1r/ppp2p1p/6np/3pP3/2BP4/2N2Q2/PPP2PPP/R3K2R w KQkq d6 0 10', moveSan: 'exd6', isRecapture: false })).toBe('Trades pawns on d6');
    // 1.fxg6# takes a pawn and mates: nothing is traded.
    expect(describeTrade({ fenBefore: '7r/8/7p/R4Ppk/8/3B1PK1/8/7q w - g6 0 1', moveSan: 'fxg6#', isRecapture: false })).toBeNull();
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
