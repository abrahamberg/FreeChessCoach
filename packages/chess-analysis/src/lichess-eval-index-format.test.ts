import { describe, expect, test } from 'vitest';
import {
  compareKeys,
  computeIndexKey,
  hasValidMagic,
  LICHESS_EVAL_MAGIC,
  LICHESS_EVAL_MAX_LINES,
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
  test('round-trips a single centipawn line', () => {
    const packed = packEntry({ fen: START_FEN, depth: 40, lines: [{ cp: 35, mate: null, moveUci: 'e2e4' }] });

    expect(packed).toHaveLength(LICHESS_EVAL_RECORD_SIZE);
    const record = unpackRecord(packed);
    expect(record.key).toEqual(computeIndexKey(START_FEN));
    expect(record.depth).toBe(40);
    expect(record.lines).toEqual([{ cp: 35, mate: null, moveUci: 'e2e4' }]);
  });

  test('round-trips multiple lines, including a negative centipawn value', () => {
    const record = unpackRecord(
      packEntry({
        fen: START_FEN,
        depth: 30,
        lines: [
          { cp: 40, mate: null, moveUci: 'e2e4' },
          { cp: -240, mate: null, moveUci: 'd2d4' },
          { cp: 10, mate: null, moveUci: 'g1f3' }
        ]
      })
    );

    expect(record.lines).toEqual([
      { cp: 40, mate: null, moveUci: 'e2e4' },
      { cp: -240, mate: null, moveUci: 'd2d4' },
      { cp: 10, mate: null, moveUci: 'g1f3' }
    ]);
  });

  test('round-trips a mate score, including a negative one, alongside a centipawn line', () => {
    const record = unpackRecord(
      packEntry({
        fen: START_FEN,
        depth: 30,
        lines: [
          { cp: null, mate: -3, moveUci: 'b7b8q' },
          { cp: 20, mate: null, moveUci: 'a2a3' }
        ]
      })
    );

    expect(record.lines[0]).toEqual({ cp: null, mate: -3, moveUci: 'b7b8q' });
    expect(record.lines[1]).toEqual({ cp: 20, mate: null, moveUci: 'a2a3' });
  });

  test('round-trips a 4-character move without trailing padding leaking into moveUci', () => {
    const record = unpackRecord(packEntry({ fen: START_FEN, depth: 12, lines: [{ cp: 10, mate: null, moveUci: 'g1f3' }] }));
    expect(record.lines[0]?.moveUci).toBe('g1f3');
  });

  test('a record with fewer than the max lines round-trips without padding leaking into lines', () => {
    const record = unpackRecord(packEntry({ fen: START_FEN, depth: 20, lines: [{ cp: 5, mate: null, moveUci: 'c2c4' }] }));
    expect(record.lines).toHaveLength(1);
  });

  test('round-trips the maximum number of lines', () => {
    const lines = Array.from({ length: LICHESS_EVAL_MAX_LINES }, (_, i) => ({ cp: i, mate: null, moveUci: 'e2e4' }));
    const record = unpackRecord(packEntry({ fen: START_FEN, depth: 20, lines }));
    expect(record.lines).toHaveLength(LICHESS_EVAL_MAX_LINES);
  });

  test('unpacks a record at a non-zero offset within a larger buffer', () => {
    const first = packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: 5, mate: null, moveUci: 'c2c4' }] });
    const second = packEntry({ fen: 'k7/8/8/8/8/8/8/K7 w - - 0 1', depth: 10, lines: [{ cp: null, mate: 2, moveUci: 'a1a2' }] });
    const buffer = Buffer.concat([first, second]);

    const record = unpackRecord(buffer, LICHESS_EVAL_RECORD_SIZE);
    expect(record.lines).toEqual([{ cp: null, mate: 2, moveUci: 'a1a2' }]);
  });

  test('rejects an entry with no lines', () => {
    expect(() => packEntry({ fen: START_FEN, depth: 10, lines: [] })).toThrow();
  });

  test('rejects an entry with more lines than LICHESS_EVAL_MAX_LINES', () => {
    const lines = Array.from({ length: LICHESS_EVAL_MAX_LINES + 1 }, () => ({ cp: 1, mate: null, moveUci: 'e2e4' }));
    expect(() => packEntry({ fen: START_FEN, depth: 10, lines })).toThrow();
  });

  test('rejects a line with both cp and mate set', () => {
    expect(() => packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: 10, mate: 3, moveUci: 'e2e4' }] })).toThrow();
  });

  test('rejects a line with neither cp nor mate set', () => {
    expect(() => packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: null, mate: null, moveUci: 'e2e4' }] })).toThrow();
  });

  test('rejects a moveUci longer than the fixed field width', () => {
    expect(() => packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: 10, mate: null, moveUci: 'e2e4e5' }] })).toThrow();
  });
});

describe('hasValidMagic', () => {
  test('accepts a buffer starting with the v2 magic header', () => {
    expect(hasValidMagic(LICHESS_EVAL_MAGIC)).toBe(true);
    expect(hasValidMagic(Buffer.concat([LICHESS_EVAL_MAGIC, Buffer.alloc(10)]))).toBe(true);
  });

  test('rejects a v1-shaped buffer (no header, starts with a record straight away)', () => {
    const v1Like = packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: 1, mate: null, moveUci: 'e2e4' }] });
    expect(hasValidMagic(v1Like)).toBe(false);
  });

  test('rejects an empty or too-short buffer', () => {
    expect(hasValidMagic(Buffer.alloc(0))).toBe(false);
    expect(hasValidMagic(Buffer.alloc(4))).toBe(false);
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
