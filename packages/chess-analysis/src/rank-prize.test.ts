import { describe, expect, it } from 'vitest';
import { classifyTacticClaims } from './classify-tactic-motif.js';

describe('the claim that leads the card', () => {
  it('names the queen a rook attack wins, not the pawn behind it', () => {
    // 21...Rhf8 allows Re6: the queen on d6 cannot take the rook (Nc5 backs it) and has no safe square.
    const fen = '2kr1r2/1pp3pp/p2q4/PbNp4/3P4/2P3P1/1PQ4P/R3R1K1 w - - 1 22';
    const result = classifyTacticClaims({ fenBefore: fen, moveSan: 'Re6', mover: 'white', pvSan: ['Re6', 'Rde8', 'Rxd6', 'cxd6', 'c4'] } as never);
    expect(result.headline).toBe('trappedPiece');
    expect(result.claims.map((claim) => claim.type)).toContain('skewer');
  });
});
