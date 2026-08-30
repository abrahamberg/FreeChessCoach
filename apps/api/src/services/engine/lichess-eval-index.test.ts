import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  compareKeys,
  LICHESS_EVAL_MAGIC,
  LICHESS_EVAL_MAGIC_V2,
  packEntry,
  type LichessEvalEntry
} from '@freechesscoach/chess-analysis/lichess-eval-index-format';
import { LichessEvalIndex, LichessEvalIndexFormatError } from './lichess-eval-index.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_D4_FEN = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';
const UNSEEN_FEN = 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1';

async function buildFixtureIndex(dir: string, entries: LichessEvalEntry[]): Promise<string> {
  const filePath = join(dir, 'lichess-eval-index.bin');
  const sorted = entries
    .map((entry) => packEntry(entry))
    .sort((a, b) => compareKeys(a.subarray(0, 16), b.subarray(0, 16)));
  await writeFile(filePath, Buffer.concat([LICHESS_EVAL_MAGIC, ...sorted]));
  return filePath;
}

/** Generates N distinct, legally-loadable FENs (a lone white knight on N
 * different empty-board squares, plus two far-apart kings) — enough
 * genuinely different computeIndexKey values to binary-search over, without
 * needing real game positions. */
function buildDistinctFens(count: number): string[] {
  const squares = [
    'b1', 'g1', 'a3', 'c3', 'h3', 'b5', 'g5', 'a7', 'c7', 'h7',
    'd2', 'e2', 'f2', 'd7', 'e7', 'f7', 'b3', 'g3', 'c5', 'f5'
  ];
  if (count > squares.length) throw new Error('not enough distinct fixture squares');

  return squares.slice(0, count).map((square) => {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rankFromTop = 8 - Number(square[1]);

    const board = Array.from({ length: 8 }, () => Array<string>(8).fill(''));
    board[0]![0] = 'k';
    board[7]![7] = 'K';
    board[rankFromTop]![file] = 'N';

    const fenRows = board.map((row) => {
      let out = '';
      let empty = 0;
      for (const cell of row) {
        if (cell === '') {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += cell;
      }
      if (empty > 0) out += String(empty);
      return out;
    });

    return `${fenRows.join('/')} w - - 0 1`;
  });
}

describe('LichessEvalIndex', () => {
  let dir: string;
  let index: LichessEvalIndex;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lichess-eval-index-test-'));
  });

  afterEach(async () => {
    await index?.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('finds a single-line centipawn evaluation by fen', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, depth: 40, lines: [{ cp: 30, mate: null, pvUci: ['e2e4'] }] },
      { fen: AFTER_E4_FEN, depth: 38, lines: [{ cp: -20, mate: null, pvUci: ['c7c5'] }] },
      { fen: AFTER_D4_FEN, depth: 35, lines: [{ cp: 15, mate: null, pvUci: ['g8f6'] }] }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup(START_FEN);

    expect(result).toEqual({ depth: 40, lines: [{ cp: 30, mate: null, pvUci: ['e2e4'] }] });
  });

  test('finds every recorded line for a position, not just the first', async () => {
    const filePath = await buildFixtureIndex(dir, [
      {
        fen: START_FEN,
        depth: 40,
        lines: [
          { cp: 30, mate: null, pvUci: ['e2e4'] },
          { cp: 25, mate: null, pvUci: ['d2d4'] },
          { cp: 20, mate: null, pvUci: ['g1f3'] }
        ]
      }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup(START_FEN);

    expect(result?.lines).toEqual([
      { cp: 30, mate: null, pvUci: ['e2e4'] },
      { cp: 25, mate: null, pvUci: ['d2d4'] },
      { cp: 20, mate: null, pvUci: ['g1f3'] }
    ]);
  });

  test('finds a mate evaluation', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, depth: 40, lines: [{ cp: 30, mate: null, pvUci: ['e2e4'] }] },
      { fen: AFTER_E4_FEN, depth: 38, lines: [{ cp: null, mate: -3, pvUci: ['c7c5'] }] }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup(AFTER_E4_FEN);

    expect(result).toEqual({ depth: 38, lines: [{ cp: null, mate: -3, pvUci: ['c7c5'] }] });
  });

  test('is indifferent to halfmove/fullmove counters, matching the build-time normalization', async () => {
    const filePath = await buildFixtureIndex(dir, [{ fen: START_FEN, depth: 40, lines: [{ cp: 30, mate: null, pvUci: ['e2e4'] }] }]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 30');

    expect(result?.lines[0]?.pvUci).toEqual(['e2e4']);
  });

  test('returns null for a position not in the index', async () => {
    const filePath = await buildFixtureIndex(dir, [{ fen: START_FEN, depth: 40, lines: [{ cp: 30, mate: null, pvUci: ['e2e4'] }] }]);
    index = await LichessEvalIndex.open(filePath);

    expect(await index.lookup(UNSEEN_FEN)).toBeNull();
  });

  test('returns null for every lookup against an index with no records (header only)', async () => {
    const filePath = await buildFixtureIndex(dir, []);
    index = await LichessEvalIndex.open(filePath);

    expect(await index.lookup(START_FEN)).toBeNull();
  });

  test('finds every entry in a larger, sorted index (binary search boundaries)', async () => {
    const positions = buildDistinctFens(20);
    const filePath = await buildFixtureIndex(
      dir,
      positions.map((fen, i) => ({ fen, depth: 20, lines: [{ cp: i, mate: null, pvUci: ['e2e4'] }] }))
    );
    index = await LichessEvalIndex.open(filePath);

    for (const [i, fen] of positions.entries()) {
      const result = await index.lookup(fen);
      expect(result?.lines[0]?.cp).toBe(i);
    }
  });

  test('rejects a file whose size (after the header) is not a multiple of the record size', async () => {
    const filePath = join(dir, 'corrupt.bin');
    await writeFile(filePath, Buffer.concat([LICHESS_EVAL_MAGIC, Buffer.alloc(10)]));

    await expect(LichessEvalIndex.open(filePath)).rejects.toThrow();
  });

  test('rejects a v1-shaped file (no magic header) with a distinguishable LichessEvalIndexFormatError', async () => {
    const filePath = join(dir, 'v1-stale.bin');
    // A v1 record's first bytes are a sha256-derived key, not any magic —
    // any non-magic-prefixed content demonstrates the same detection.
    await writeFile(filePath, packEntry({ fen: START_FEN, depth: 10, lines: [{ cp: 1, mate: null, pvUci: ['e2e4'] }] }));

    await expect(LichessEvalIndex.open(filePath)).rejects.toThrow(LichessEvalIndexFormatError);
  });

  test('rejects a stale v2-shaped file (previous magic header) with a distinguishable LichessEvalIndexFormatError, soft-skipped not thrown as a generic crash', async () => {
    const filePath = join(dir, 'v2-stale.bin');
    await writeFile(filePath, Buffer.concat([LICHESS_EVAL_MAGIC_V2, Buffer.alloc(63)]));

    await expect(LichessEvalIndex.open(filePath)).rejects.toThrow(LichessEvalIndexFormatError);
  });

  test('rejects a completely empty file with a distinguishable LichessEvalIndexFormatError', async () => {
    const filePath = join(dir, 'empty.bin');
    await writeFile(filePath, Buffer.alloc(0));

    await expect(LichessEvalIndex.open(filePath)).rejects.toThrow(LichessEvalIndexFormatError);
  });
});
