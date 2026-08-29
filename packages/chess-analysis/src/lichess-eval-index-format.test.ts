import { describe, expect, test } from 'vitest';
import {
  compareKeys,
  computeIndexKey,
  LICHESS_EVAL_RECORD_SIZE,
  packEntry,
  unpackRecord
} from './lichess-eval-index-format.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('computeIndexKey', () => {
  test('is stable for the same position regardless of halfmove/fullmove counters', () => {
    const withCounters = START_FEN;
    const differentCounters = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 12';

    expect(computeIndexKey(withCounters)).toEqual(computeIndexKey(differentCounters));
  });

  test('differs for a different position', () => {
    const otherFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

    expect(computeIndexKey(START_FEN)).not.toEqual(computeIndexKey(otherFen));
  });
});

describe('packEntry / unpackRecord', () => {
  test('round-trips a centipawn evaluation', () => {
    const packed = packEntry({ fen: START_FEN, cp: 35, mate: null, depth: 40, moveUci: 'e2e4' });

    expect(packed).toHaveLength(LICHESS_EVAL_RECORD_SIZE);
    const record = unpackRecord(packed);
    expect(record.key).toEqual(computeIndexKey(START_FEN));
    expect(record.cp).toBe(35);
    expect(record.mate).toBeNull();
    expect(record.depth).toBe(40);
    expect(record.moveUci).toBe('e2e4');
  });

  test('round-trips a negative centipawn evaluation', () => {
    const record = unpackRecord(packEntry({ fen: START_FEN, cp: -240, mate: null, depth: 20, moveUci: 'd7d5' }));
    expect(record.cp).toBe(-240);
  });

  test('round-trips a mate score, including a negative one', () => {
    const record = unpackRecord(packEntry({ fen: START_FEN, cp: null, mate: -3, depth: 30, moveUci: 'b7b8q' }));
    expect(record.cp).toBeNull();
    expect(record.mate).toBe(-3);
    expect(record.moveUci).toBe('b7b8q');
  });

  test('round-trips a 4-character move without trailing padding leaking into moveUci', () => {
    const record = unpackRecord(packEntry({ fen: START_FEN, cp: 10, mate: null, depth: 12, moveUci: 'g1f3' }));
    expect(record.moveUci).toBe('g1f3');
  });

  test('unpacks a record at a non-zero offset within a larger buffer', () => {
    const first = packEntry({ fen: START_FEN, cp: 5, mate: null, depth: 10, moveUci: 'c2c4' });
    const second = packEntry({ fen: 'k7/8/8/8/8/8/8/K7 w - - 0 1', cp: null, mate: 2, depth: 10, moveUci: 'a1a2' });
    const buffer = Buffer.concat([first, second]);

    const record = unpackRecord(buffer, LICHESS_EVAL_RECORD_SIZE);
    expect(record.mate).toBe(2);
    expect(record.moveUci).toBe('a1a2');
  });

  test('rejects an entry with both cp and mate set', () => {
    expect(() => packEntry({ fen: START_FEN, cp: 10, mate: 3, depth: 10, moveUci: 'e2e4' })).toThrow();
  });

  test('rejects an entry with neither cp nor mate set', () => {
    expect(() => packEntry({ fen: START_FEN, cp: null, mate: null, depth: 10, moveUci: 'e2e4' })).toThrow();
  });

  test('rejects a moveUci longer than the fixed field width', () => {
    expect(() => packEntry({ fen: START_FEN, cp: 10, mate: null, depth: 10, moveUci: 'e2e4e5' })).toThrow();
  });
});

describe('compareKeys', () => {
  test('orders keys the same way Buffer.compare does, for use in a binary search', () => {
    const a = Buffer.from([0x00, 0x01]);
    const b = Buffer.from([0x00, 0x02]);
    expect(compareKeys(a, b)).toBeLessThan(0);
    expect(compareKeys(b, a)).toBeGreaterThan(0);
    expect(compareKeys(a, a)).toBe(0);
  });
});
