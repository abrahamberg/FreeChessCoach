import { describe, expect, test } from 'vitest';
import { inBookWalk, resolveOpening } from './opening-book.js';
import { positionKey } from './opening-book-key.js';
import { parsePgn } from './pgn.js';

const NAJDORF_ENGLISH_ATTACK = `
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
6. Be3 e5 7. Nb3 Be6 8. f3
`;

const ORTHODOX_CAPABLANCA_BY_NF3 = `
1. Nf3 d5 2. d4 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 O-O
6. e3 Nbd7 7. Rc1 b6 8. cxd5 exd5 9. Bb5
`;

const ORTHODOX_CAPABLANCA_BY_D4 = `
1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. Nc3 Be7 5. Bg5 O-O
6. e3 Nbd7 7. Rc1 b6 8. cxd5 exd5 9. Bb5
`;

describe('inBookWalk', () => {
  test('marks every played move in a known opening line as book', () => {
    const result = inBookWalk(parsePgn(NAJDORF_ENGLISH_ATTACK).positions);

    expect(result).toHaveLength(15);
    expect(result.every((move) => move.classification === 'book')).toBe(true);
    expect(result.lastBookPly).toEqual({ white: 15, black: 14 });
  });

  test('stops permanently after a deviation and records the deviating side', () => {
    const positions = parsePgn(`
      1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
      6. a3 e5
    `).positions;
    const result = inBookWalk(positions);

    expect(result[10]).toMatchObject({
      classification: undefined,
      leftBook: {
        ply: 11,
        played: 'a3',
        alternatives: ['Bc4', 'Bd3', 'Be2', 'Be3', 'Bg5', 'Rg1', 'f4', 'g3', 'g4', 'h3'],
      },
    });
    expect(result[11]?.classification).toBeUndefined();
    expect(result.lastBookPly).toEqual({ white: 9, black: 10 });
  });

  test('tracks the final book ply for Black when Black is the first to deviate', () => {
    const result = inBookWalk(parsePgn(`
      1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
      6. Be3 e5 7. Nb3 Be6 8. f3 h6
    `).positions);

    expect(result[15]).toMatchObject({
      classification: undefined,
      leftBook: { ply: 16, played: 'h6', alternatives: [] },
    });
    expect(result.lastBookPly).toEqual({ white: 15, black: 14 });
  });
});

describe('resolveOpening', () => {
  test('returns the deepest named Najdorf line and splits its family', () => {
    const positions = parsePgn(NAJDORF_ENGLISH_ATTACK).positions;
    const result = resolveOpening(positions.map((position) => positionKey(position.fen)));

    expect(result).toEqual({
      eco: 'B90',
      ecoVolume: 'B',
      name: 'Sicilian Defense: Najdorf Variation, English Attack',
      family: 'Sicilian Defense',
      variation: 'Najdorf Variation, English Attack',
      ply: 15,
    });
  });

  test('resolves transposed move orders to the same deepest named position', () => {
    const byNf3 = parsePgn(ORTHODOX_CAPABLANCA_BY_NF3).positions;
    const byD4 = parsePgn(ORTHODOX_CAPABLANCA_BY_D4).positions;

    expect(resolveOpening(byNf3.map((position) => positionKey(position.fen)))).toEqual(
      resolveOpening(byD4.map((position) => positionKey(position.fen))),
    );
  });

  test('returns null when no indexed position is present', () => {
    expect(resolveOpening(['not a position'])).toBeNull();
  });
});
