import { describe, expect, test } from 'vitest';
import { gameOutcomeFromPgn } from './game-outcome.js';

function fenPgn(fen: string): string {
  return `[Event "?"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`;
}

describe('gameOutcomeFromPgn', () => {
  test('checkmate by black (Fool\'s mate) reports white to lose', () => {
    const outcome = gameOutcomeFromPgn('1. f3 e5 2. g4 Qh4#');
    expect(outcome).toEqual({ isOver: true, result: '0-1', reason: 'checkmate' });
  });

  test('checkmate by white (Scholar\'s mate) reports black to lose', () => {
    const outcome = gameOutcomeFromPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
    expect(outcome).toEqual({ isOver: true, result: '1-0', reason: 'checkmate' });
  });

  test('stalemate', () => {
    const outcome = gameOutcomeFromPgn(fenPgn('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'));
    expect(outcome).toEqual({ isOver: true, result: '1/2-1/2', reason: 'stalemate' });
  });

  test('insufficient material', () => {
    const outcome = gameOutcomeFromPgn(fenPgn('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(outcome).toEqual({ isOver: true, result: '1/2-1/2', reason: 'insufficient_material' });
  });

  test('threefold repetition', () => {
    const outcome = gameOutcomeFromPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8');
    expect(outcome).toEqual({ isOver: true, result: '1/2-1/2', reason: 'threefold_repetition' });
  });

  test('fifty-move rule (sufficient material, halfmove clock at 100)', () => {
    const outcome = gameOutcomeFromPgn(fenPgn('4k3/8/8/8/8/8/8/R3K3 w - - 100 60'));
    expect(outcome).toEqual({ isOver: true, result: '1/2-1/2', reason: 'fifty_move_rule' });
  });

  test('game not over', () => {
    const outcome = gameOutcomeFromPgn('1. e4');
    expect(outcome).toEqual({ isOver: false, result: null, reason: null });
  });
});
