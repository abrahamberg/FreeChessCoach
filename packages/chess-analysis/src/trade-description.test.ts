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
/** An Italian after 4.d3 d6 5.Bg5 Be7: both sides have other pieces out. */
const BOTH_DEVELOPED = 'r1bqk2r/ppp1bppp/2np1n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R w KQkq - 2 6';
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
    expect(describeTrade({ fenBefore: '4k3/8/2p5/3n4/8/2N5/8/4K3 w - - 0 1', moveSan: 'Nxd5', isRecapture: false, replySan: 'cxd5' })).toBe('Trades knights on d5');
  });

  describe('what the trade gives up (Task 126.4)', () => {
    test('the only developed piece, and a queen that comes out by taking back (the owner\'s game, 5.Bxf6)', () => {
      expect(describeTrade({ fenBefore: BISHOP_FOR_KNIGHT, moveSan: 'Bxf6', isRecapture: false, replySan: 'Qxf6' })).toBe(
        "Trades the bishop for the knight on f6, giving up White's only developed piece; Black can take back with the queen, bringing it out"
      );
    });

    test('a pawn taking back develops nothing', () => {
      expect(describeTrade({ fenBefore: BISHOP_FOR_KNIGHT, moveSan: 'Bxf6', isRecapture: false, replySan: 'gxf6' })).toBe(
        "Trades the bishop for the knight on f6, giving up White's only developed piece"
      );
    });

    test('the Scotch, 4…Nxd4: Black\'s one knight for a queen in the centre', () => {
      expect(describeTrade({ fenBefore: SCOTCH_AFTER_NXD4, moveSan: 'Nxd4', isRecapture: false, replySan: 'Qxd4' })).toBe(
        "Trades knights on d4, giving up Black's only developed piece; White can take back with the queen, bringing it out"
      );
    });

    test('a minor piece taking back from its home square is developed', () => {
      // …Bxc3 is answered by the knight from b1.
      const fen = 'rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2B5/PPPP1PPP/RN1QKBNR b KQkq - 0 1';
      expect(describeTrade({ fenBefore: fen, moveSan: 'Bxc3', isRecapture: false, replySan: 'Nxc3' })).toBe(
        "Trades bishops on c3, giving up Black's only developed piece; White can take back with the knight, developing it"
      );
    });

    test('not in an endgame: a lone bishop is not "the only developed piece", and nothing is added', () => {
      expect(describeTrade({ fenBefore: '3qk3/8/5n2/6B1/8/8/8/4K3 w - - 0 1', moveSan: 'Bxf6', isRecapture: false, replySan: 'Qxf6' })).toBe('Trades the bishop for the knight on f6');
    });

    test('not when the mover has other pieces out: the recapture alone is no point', () => {
      // The same Italian without …Be7: the queen takes back, and White's bishop on c4 and knight on f3 are out as well.
      const queenTakesBack = 'r1bqkb1r/ppp2ppp/2np1n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R w KQkq - 2 6';
      expect(describeTrade({ fenBefore: queenTakesBack, moveSan: 'Bxf6', isRecapture: false, replySan: 'Qxf6' })).toBe('Trades the bishop for the knight on f6');
    });
  });

  // A bishop is 330 and a knight 320 on `see.ts`'s scale, so the exchange
  // comes out ten points off level, which is still level.
  test('names a bishop given for a knight', () => {
    expect(describeTrade({ fenBefore: BOTH_DEVELOPED, moveSan: 'Bxf6', isRecapture: false, replySan: 'Bxf6' })).toBe('Trades the bishop for the knight on f6');
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
