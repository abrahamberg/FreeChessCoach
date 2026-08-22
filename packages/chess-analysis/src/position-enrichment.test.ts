import { describe, expect, test } from 'vitest';
import { enrichPositions } from './position-enrichment.js';
import { parsePgn } from './pgn.js';

describe('enrichPositions', () => {
  test('computes a feature delta for a move that creates a fork', () => {
    const pgn = `[SetUp "1"]
[FEN "4k3/8/1r3n2/8/8/2N5/8/7K w - - 0 1"]

1. Nd5 *`;

    const enrichment = enrichPositions(parsePgn(pgn).positions);
    const move = enrichment[1];
    if (!move || !move.moveFlags || !move.featureDelta) throw new Error('move enrichment fixture is incomplete');

    expect(move.moveFlags).toMatchObject({ movedPieceType: 'n', legalMoveCount: 11 });
    expect(move.features.forks).toEqual(expect.arrayContaining([
      expect.objectContaining({ square: 'd5', piece: 'n' })
    ]));
    expect(move.featureDelta.newForks).toEqual(expect.arrayContaining([
      expect.objectContaining({ square: 'd5', piece: 'n' })
    ]));
  });
});
