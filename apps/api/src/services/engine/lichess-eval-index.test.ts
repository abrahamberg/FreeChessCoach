import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { compareKeys, packEntry, type LichessEvalEntry } from '@freechesscoach/chess-analysis/lichess-eval-index-format';
import { LichessEvalIndex } from './lichess-eval-index.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_D4_FEN = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';
const UNSEEN_FEN = 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1';

async function buildFixtureIndex(dir: string, entries: LichessEvalEntry[]): Promise<string> {
  const filePath = join(dir, 'lichess-eval-index.bin');
  const sorted = entries
    .map((entry) => packEntry(entry))
    .sort((a, b) => compareKeys(a.subarray(0, 16), b.subarray(0, 16)));
  await writeFile(filePath, Buffer.concat(sorted));
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

  test('finds a centipawn evaluation by fen', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, cp: 30, mate: null, depth: 40, moveUci: 'e2e4' },
      { fen: AFTER_E4_FEN, cp: -20, mate: null, depth: 38, moveUci: 'c7c5' },
      { fen: AFTER_D4_FEN, cp: 15, mate: null, depth: 35, moveUci: 'g8f6' }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup(START_FEN);

    expect(result).toEqual({ cp: 30, mate: null, depth: 40, moveUci: 'e2e4' });
  });

  test('finds a mate evaluation', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, cp: 30, mate: null, depth: 40, moveUci: 'e2e4' },
      { fen: AFTER_E4_FEN, cp: null, mate: -3, depth: 38, moveUci: 'c7c5' }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup(AFTER_E4_FEN);

    expect(result).toEqual({ cp: null, mate: -3, depth: 38, moveUci: 'c7c5' });
  });

  test('is indifferent to halfmove/fullmove counters, matching the build-time normalization', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, cp: 30, mate: null, depth: 40, moveUci: 'e2e4' }
    ]);
    index = await LichessEvalIndex.open(filePath);

    const result = await index.lookup('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 30');

    expect(result?.moveUci).toBe('e2e4');
  });

  test('returns null for a position not in the index', async () => {
    const filePath = await buildFixtureIndex(dir, [
      { fen: START_FEN, cp: 30, mate: null, depth: 40, moveUci: 'e2e4' }
    ]);
    index = await LichessEvalIndex.open(filePath);

    expect(await index.lookup(UNSEEN_FEN)).toBeNull();
  });

  test('returns null for every lookup against an empty index', async () => {
    const filePath = await buildFixtureIndex(dir, []);
    index = await LichessEvalIndex.open(filePath);

    expect(await index.lookup(START_FEN)).toBeNull();
  });

  test('finds every entry in a larger, sorted index (binary search boundaries)', async () => {
    const positions = buildDistinctFens(20);
    const filePath = await buildFixtureIndex(
      dir,
      positions.map((fen, i) => ({ fen, cp: i, mate: null, depth: 20, moveUci: 'e2e4' }))
    );
    index = await LichessEvalIndex.open(filePath);

    for (const [i, fen] of positions.entries()) {
      const result = await index.lookup(fen);
      expect(result?.cp).toBe(i);
    }
  });

  test('rejects a file whose size is not a multiple of the record size', async () => {
    const filePath = join(dir, 'corrupt.bin');
    await writeFile(filePath, Buffer.alloc(10));

    await expect(LichessEvalIndex.open(filePath)).rejects.toThrow();
  });
});
