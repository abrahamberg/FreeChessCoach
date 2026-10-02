import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { pinnedPieceTask, pins, pinShapes } from './tactic-pins.js';

function pinnedAfter(fen: string, san: string): Square[] {
  const chess = new Chess(fen);
  chess.move(san);
  return pins(chess).map((hit) => hit.pinned);
}

function taskAfter(fen: string, san: string, pinned: Square): string | null {
  const chess = new Chess(fen);
  chess.move(san);
  const hit = pinShapes(chess).find((shape) => shape.pinned === pinned);
  return hit ? pinnedPieceTask(chess, hit) : null;
}

describe('pins', () => {
  it('keeps the classic pin of a knight to the queen (4.Bg5)', () => {
    expect(pinnedAfter('rnbqkb1r/ppp2ppp/5n2/3pp3/4P3/3P1P2/PPP3PP/RNBQKBNR w KQkq - 0 4', 'Bg5')).toContain('f6');
  });

  it('keeps a queen pinned to the king by a cheaper piece: taking the pinner costs the queen', () => {
    expect(pinnedAfter('rn2kbnr/pppqpppp/6b1/3P4/Q3P3/2N2N2/PP3PPP/R1B1KB1R w KQkq - 3 9', 'Bb5')).toContain('d7');
  });

  // The owner's rule, 2026-10-02: a piece that can take its pinner is still
  // pinned when it had something else to do.
  it('keeps the Englund pin (6…Bb4): the bishop on c3 can take on b4, but it wants the queen on b2', () => {
    const englund = 'r1b1kbnr/pppp1ppp/2n5/4P3/8/2B2N2/PqP1PPPP/RN1QKB1R b KQkq - 1 6';
    expect(pinnedAfter(englund, 'Bb4')).toContain('c3');
    expect(taskAfter(englund, 'Bb4', 'c3')).toBe('capture');
  });

  it('keeps a rook that faces a rook but wants the queen beside it (26.Rg1)', () => {
    const fen = 'r3q1k1/p2b3p/Bnp2brQ/3p1p2/P3p3/B1N2P2/1PP4P/3R3K w - - 5 26';
    expect(pinnedAfter(fen, 'Rg1')).toContain('g6');
    expect(taskAfter(fen, 'Rg1', 'g6')).toBe('capture');
  });

  it('keeps a rook that faces a rook but holds a pawn one step from promoting (Lichess CObOW)', () => {
    const fen = '8/8/8/k7/P5RK/8/1r4p1/8 b - - 7 41';
    expect(pinnedAfter(fen, 'Rb4')).toContain('g4');
    expect(taskAfter(fen, 'Rb4', 'g4')).toBe('capture');
  });

  it('keeps a bishop that is the only defender of a knight (6…Bxc3+: Bxc3 would drop g5)', () => {
    const fen = 'rnbqk1nr/ppp3pp/8/4ppN1/1b2p3/2NP4/PPPB1PPP/R2QKB1R b KQkq - 0 6';
    expect(pinnedAfter(fen, 'Bxc3')).toContain('d2');
    expect(taskAfter(fen, 'Bxc3', 'd2')).toBe('guard');
  });

  it('keeps a bishop that stands on a second line as well (22.Bh6: g7 is pinned to the king by the queen)', () => {
    const fen = '1r3rk1/p1q1ppbp/3p4/2p2P1p/P3P3/3P2Q1/P2B2P1/1R3RK1 w - - 0 22';
    expect(pinnedAfter(fen, 'Bh6')).toContain('g7');
    expect(taskAfter(fen, 'Bh6', 'g7')).toBe('block');
  });

  // Found on the dev re-run: with the king's shape gone, two king moves out
  // of check (12.Kc2, 38.Kc3) picked up a card they never had.
  it('leaves a king in front alone: it is in check, not offered an exchange', () => {
    const inCheck = new Chess('rn2k1nr/pppb1ppp/8/2b5/2Pq1p1P/1Q1K4/PP1P2P1/RNB2B1R w kq - 5 12');
    expect(pins(inCheck).map((hit) => hit.pinned)).toContain('d3');
  });

  // The owner's review, 2026-10-02: 39 of the 211 pins on the dev games were
  // these. The "pinned" piece simply takes the pinner and had nothing else to do.
  it('is not a pin when a rook faces a rook with the king behind: the rook can take', () => {
    expect(pinnedAfter('3q2k1/pQ3p1p/1p2pp2/2p5/2P2P2/P3P1P1/1P2RK1P/3r4 b - - 3 27', 'Rd2')).not.toContain('e2');
  });

  it('is not a pin when a bishop faces a bishop with a rook behind', () => {
    expect(pinnedAfter('r4rk1/1pq1ppb1/p1n3pp/3p4/3Pb3/2P1BN1P/PP1Q1PP1/R3RBK1 w - - 1 16', 'Bxh6')).not.toContain('g7');
  });

  it('is not a pin when a queen is offered to a queen', () => {
    expect(pinnedAfter('5rrk/pp5p/2p5/4q3/4N3/3B1PPn/P2Q3P/4RK1R w - - 9 30', 'Qc3')).not.toContain('e5');
  });
});
