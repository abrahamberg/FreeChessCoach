import { describe, expect, test } from 'vitest';
import { classifyLiveMove } from './classify.js';
import { analyzeChecksCapturesThreats } from './checks-captures-threats.js';

const CHECK_POSITION = '7k/8/8/8/8/8/4Q3/K7 w - - 0 1';
const CAPTURE_POSITION = '4k3/8/8/3p4/2B5/8/8/4K3 w - - 0 1';
const FORK_POSITION = '4k3/8/1r3n2/8/5N2/8/8/7K w - - 0 1';

describe('analyzeChecksCapturesThreats', () => {
  test('returns available checking moves with calculated checkmate flags', () => {
    const result = analyzeChecksCapturesThreats(CHECK_POSITION);

    expect(result.checks.available).toBe(true);
    expect(result.checks.moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ moveSan: 'Qe8+', isCheckmate: false })
    ]));
  });

  test('returns capture opportunities with the existing favorable calculation', () => {
    const result = analyzeChecksCapturesThreats(CAPTURE_POSITION);

    expect(result.captures.available).toBe(true);
    expect(result.captures.moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ moveSan: 'Bxd5', from: 'c4', to: 'd5', capturedPiece: 'p', favorable: true })
    ]));
  });

  test('returns quiet moves that newly attack pieces as raw threats', () => {
    const result = analyzeChecksCapturesThreats(FORK_POSITION);

    expect(result.threats.available).toBe(true);
    expect(result.threats.moves).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moveSan: 'Nd5',
        from: 'f4',
        to: 'd5',
        targetedPieces: expect.arrayContaining([
          expect.objectContaining({ square: 'b6', piece: 'r', color: 'black' }),
          expect.objectContaining({ square: 'f6', piece: 'n', color: 'black' })
        ])
      })
    ]));
    expect(result.threats.moves.every((move) => !move.moveSan.includes('x') && !move.moveSan.includes('+'))).toBe(true);
  });

  test('returns explicit unavailable groups when no CCT move exists', () => {
    const result = analyzeChecksCapturesThreats('7k/8/8/8/8/8/8/K7 w - - 0 1');

    expect(result.checks).toEqual({ available: false, moves: [] });
    expect(result.captures).toEqual({ available: false, moves: [] });
    expect(result.threats).toEqual({ available: false, moves: [] });
  });

  test('is attached to each classified move for downstream consumers', () => {
    const move = classifyLiveMove({
      ply: 1,
      moveSan: 'Nd5',
      mover: 'white',
      fenBefore: FORK_POSITION,
      fenAfter: '4k3/8/1r3n2/8/3N4/8/8/7K b - - 1 1',
      evalBefore: { ply: 0, fen: FORK_POSITION, depth: 16, lines: [] },
      evalAfter: { ply: 1, fen: 'after', depth: 16, lines: [] },
      userColor: 'white'
    });

    expect(move.checksCapturesThreats?.threats.moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ moveSan: 'Nd5', targetedPieces: expect.arrayContaining([
        expect.objectContaining({ square: 'b6', piece: 'r' }),
        expect.objectContaining({ square: 'f6', piece: 'n' })
      ]) })
    ]));
  });
});
