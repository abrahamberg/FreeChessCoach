import { describe, expect, test } from 'vitest';
import { kickReason, withoutCardedKick } from './kick-reason.js';

describe('a pawn that kicks a piece (Task 126.3)', () => {
  test('the bishop that pins a knight (the owner\'s game, 4…h6)', () => {
    const afterBg5 = 'rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR b KQkq - 1 4';
    expect(kickReason(afterBg5, 'h6')).toBe('Attacks the bishop on g5, which pins the knight on f6');
  });

  test('a bishop that pins nothing (the Ruy Lopez, 3…a6)', () => {
    const ruy = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    expect(kickReason(ruy, 'a6')).toBe('Attacks the bishop on b5');
  });

  test('says what the pawn does, not what the piece must do', () => {
    // The Fishing Pole: 5.h3 hits the knight on g4, and it stays there (…h5).
    const fishingPole = 'r1bqkb1r/pppp1ppp/2n5/1B2p3/4P1n1/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5';
    expect(kickReason(fishingPole, 'h3')).toBe('Attacks the knight on g4');
  });

  test('silent when the piece simply takes the pawn and wins it', () => {
    expect(kickReason('4k3/7p/8/6B1/8/8/8/4K3 b - - 0 1', 'h6')).toBeNull();
  });

  test('silent when a pawn already attacked the piece', () => {
    // The pawn on f6 already hits the bishop; …h6 adds nothing new.
    expect(kickReason('4k3/7p/5p2/6B1/8/8/8/4K3 b - - 0 1', 'h6')).toBeNull();
  });

  test('silent on a pawn that attacks only a pawn, and on a piece move', () => {
    expect(kickReason('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'd4')).toBeNull();
    expect(kickReason('rnbqkb1r/ppp2ppp/5n2/3pp1B1/4P3/3P1P2/PPP3PP/RN1QKBNR b KQkq - 1 4', 'Be7')).toBeNull();
  });

  test('silent on a pawn that takes: the capture is the story', () => {
    // exd5 takes a pawn and lands hitting the knight on c6.
    expect(kickReason('r1bqkbnr/ppp2ppp/2n5/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4', 'exd5')).toBeNull();
  });

  test('silent when the pawn is pinned to its king and cannot take', () => {
    // g5 looks at the knight on h4, but the rook on g1 pins the pawn to the king on g8.
    expect(kickReason('6k1/8/6p1/8/7N/8/8/4K1R1 b - - 0 1', 'g5')).toBeNull();
  });

  test('a queen that pins a knight to the king', () => {
    const queenOut = 'r1bqkbnr/ppp2ppp/2np4/1Q2p3/4P3/5N2/PPPP1PPP/RNB1KB1R b KQkq - 0 1';
    expect(kickReason(queenOut, 'a6')).toBe('Attacks the queen on b5, which pins the knight on c6');
  });

  test('a card for what the move did, or for what it allowed, replaces the note', () => {
    const reasons = ['Attacks the bishop on g5, which pins the knight on f6', 'Concedes the centre'];
    expect(withoutCardedKick(reasons, { tacticOpportunity: { found: true } })).toEqual(['Concedes the centre']);
    expect(withoutCardedKick(reasons, { tacticAllowed: { type: 'freePiece' } })).toEqual(['Concedes the centre']);
    // A chance the mover missed elsewhere does not touch what the pawn did.
    expect(withoutCardedKick(reasons, { tacticOpportunity: { found: false } })).toEqual(reasons);
    expect(withoutCardedKick(reasons, {})).toEqual(reasons);
  });
});
