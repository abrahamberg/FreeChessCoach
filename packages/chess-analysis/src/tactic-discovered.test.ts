import { describe, expect, test } from 'vitest';
import { discoveredAttack } from './tactic-discovered.js';

describe('discoveredAttack', () => {
  test('detects a discovered check when a blocking piece steps aside', () => {
    const fen = 'k7/8/8/N7/8/8/8/R3K3 w - - 0 1';

    expect(discoveredAttack(fen, 'Nb3', 'w')).toBe(true);
  });

  test('detects a discovered attack on a piece that is not the king', () => {
    const fen = 'q6k/8/8/N7/8/8/8/R3K3 w - - 0 1';

    expect(discoveredAttack(fen, 'Nb3', 'w')).toBe(true);
  });

  test('reports no discovery for an ordinary developing move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    expect(discoveredAttack(fen, 'e4', 'w')).toBe(false);
  });

  test('returns false for an illegal move rather than throwing', () => {
    const fen = 'k7/8/8/N7/8/8/8/R3K3 w - - 0 1';

    expect(discoveredAttack(fen, 'Qh8', 'w')).toBe(false);
  });
});
