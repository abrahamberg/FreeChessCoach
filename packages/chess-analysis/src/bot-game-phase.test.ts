import { describe, expect, test } from 'vitest';
import { classifyBotGamePhase } from './bot-game-phase.js';

describe('classifyBotGamePhase', () => {
  test('classifies the starting position as opening', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(classifyBotGamePhase(fen, 0, 6)).toBe('opening');
  });

  test('classifies a developed, full-material position past book depth as middlegame', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    // bookPlies=2 -> ceiling = min(30, 2*2+4) = 8, ply 10 is past it.
    expect(classifyBotGamePhase(fen, 10, 2)).toBe('middlegame');
  });

  test('classifies a reduced-material position as endgame regardless of ply count', () => {
    const fen = '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1';
    expect(classifyBotGamePhase(fen, 10, 6)).toBe('endgame');
  });

  test('endgame material overrides an early ply count', () => {
    // Pathological but possible after heavy early trades.
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    expect(classifyBotGamePhase(fen, 8, 6)).toBe('endgame');
  });

  test('stays within opening while still inside book-derived ceiling', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    // bookPlies=6 -> ceiling = min(30, 6*2+4) = 16, ply 10 is still under it.
    expect(classifyBotGamePhase(fen, 10, 6)).toBe('opening');
  });
});
