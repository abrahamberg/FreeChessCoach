import { Chess } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { isBrilliantSoundnessCandidate } from './classify-brilliant.js';

const candidate = (fenBefore: string, moveSan: string): boolean => {
  const chess = new Chess(fenBefore);
  const mover = chess.turn() === 'w' ? 'white' : 'black';
  const move = chess.move(moveSan);
  return isBrilliantSoundnessCandidate({ fenBefore, fenAfter: chess.fen(), moveSan, mover, isBookMove: false, legalMoveCount: 20, isCapture: Boolean(move.captured), drop: 0 });
};

describe('a sacrifice gives material up', () => {
  test('a knight taking a rook and retaken by the king is an exchange won, not a sacrifice (23.Nxd8 Kxd8)', () => {
    expect(candidate('2kr4/1pp2rpp/p2qN3/Pb1p4/3P4/2P3P1/1PQ4P/R3R1K1 w - - 3 23', 'Nxd8')).toBe(false);
  });

  test('a queen taking a defended pawn is still one', () => {
    expect(candidate('4k3/8/2p5/3p4/8/8/8/3QK3 w - - 0 1', 'Qxd5')).toBe(true);
  });
});
