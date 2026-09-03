import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { packPuzzlePool, type PuzzleRecord } from '@freechesscoach/chess-analysis';
import { openPuzzlePoolFromEnv, PuzzlePool, PuzzlePoolFormatError } from './puzzle-pool.js';

const RECORDS: PuzzleRecord[] = [
  { puzzleId: '08XzM', fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', moves: ['a1a2', 'e8d8'], rating: 700, themes: ['fork'] },
  { puzzleId: '062Zq', fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', moves: ['a1a2', 'e8d8'], rating: 1500, themes: ['pin'] }
];

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'puzzle-pool-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.PUZZLE_POOL_PATH;
});

describe('PuzzlePool.open', () => {
  test('reads back every record from a valid pool file', async () => {
    const filePath = join(dir, 'puzzle-pool.bin');
    await writeFile(filePath, packPuzzlePool(RECORDS));

    const pool = await PuzzlePool.open(filePath);

    expect(pool.all()).toEqual(RECORDS);
  });

  test('throws PuzzlePoolFormatError for a file with no valid magic header', async () => {
    const filePath = join(dir, 'not-a-pool.bin');
    await writeFile(filePath, Buffer.from('definitely not a puzzle pool'));

    await expect(PuzzlePool.open(filePath)).rejects.toBeInstanceOf(PuzzlePoolFormatError);
  });

  test('a missing file rejects with ENOENT', async () => {
    await expect(PuzzlePool.open(join(dir, 'missing.bin'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('openPuzzlePoolFromEnv', () => {
  test('returns null when PUZZLE_POOL_PATH is unset', async () => {
    delete process.env.PUZZLE_POOL_PATH;

    expect(await openPuzzlePoolFromEnv()).toBeNull();
  });

  test('returns null (not a throw) when the configured file does not exist yet', async () => {
    process.env.PUZZLE_POOL_PATH = join(dir, 'not-yet-deployed.bin');

    expect(await openPuzzlePoolFromEnv()).toBeNull();
  });

  test('returns null (not a throw) for a stale/invalid-header file', async () => {
    const filePath = join(dir, 'stale.bin');
    await writeFile(filePath, Buffer.from('stale format'));
    process.env.PUZZLE_POOL_PATH = filePath;

    expect(await openPuzzlePoolFromEnv()).toBeNull();
  });

  test('returns an open pool for a valid file', async () => {
    const filePath = join(dir, 'puzzle-pool.bin');
    await writeFile(filePath, packPuzzlePool(RECORDS));
    process.env.PUZZLE_POOL_PATH = filePath;

    const pool = await openPuzzlePoolFromEnv();

    expect(pool?.all()).toEqual(RECORDS);
  });
});
