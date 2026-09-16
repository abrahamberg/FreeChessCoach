/* global Buffer, URL, process */
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  LICHESS_EVAL_MAGIC,
  LICHESS_EVAL_MAX_LINES,
  LICHESS_EVAL_RECORD_SIZE,
  unpackRecord
} from '@freechesscoach/chess-analysis/lichess-eval-index-format';
import { scanDepthForRank } from '@freechesscoach/chess-analysis';
import { LichessEvalIndex, LichessEvalIndexFormatError } from '../src/services/engine/lichess-eval-index.ts';
import { buildLichessEvalIndex, parseLichessEvalLine, readLines, resolveInputPath } from './build-lichess-eval-index.mjs';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const execFileAsync = promisify(execFile);

describe('parseLichessEvalLine', () => {
  test('picks the deepest evals entry and keeps all of its pvs', () => {
    const line = JSON.stringify({
      fen: START_FEN,
      evals: [
        { knodes: 100, depth: 20, pvs: [{ cp: 10, line: 'd2d4 d7d5' }] },
        {
          knodes: 500,
          depth: 40,
          pvs: [
            { cp: 30, line: 'e2e4 e7e5 g1f3' },
            { cp: 25, line: 'd2d4 d7d5' },
            { cp: 20, line: 'g1f3 g8f6' }
          ]
        }
      ]
    });

    expect(parseLichessEvalLine(line)).toEqual({
      fen: START_FEN,
      depth: 40,
      lines: [
        { cp: 30, mate: null, pvUci: ['e2e4', 'e7e5', 'g1f3'] },
        { cp: 25, mate: null, pvUci: ['d2d4', 'd7d5'] },
        { cp: 20, mate: null, pvUci: ['g1f3', 'g8f6'] }
      ]
    });
  });

  test('harvests up to scanDepthForRank(rank) UCI moves per line, clamping a longer pv.line (Phase 49)', () => {
    const rank0Depth = scanDepthForRank(0);
    const longPv = Array.from({ length: rank0Depth + 5 }, (_, i) => `move${i}`).join(' ');
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 20, pvs: [{ cp: 10, line: longPv }] }] });

    expect(parseLichessEvalLine(line)?.lines[0]?.pvUci).toHaveLength(rank0Depth);
  });

  test('a lower-ranked pv is clamped to its own (shallower) schedule depth (Phase 49)', () => {
    const lastRank = LICHESS_EVAL_MAX_LINES - 1;
    const lastRankDepth = scanDepthForRank(lastRank);
    const longPv = Array.from({ length: lastRankDepth + 5 }, (_, i) => `move${i}`).join(' ');
    const pvs = Array.from({ length: lastRank }, () => ({ cp: 1, line: 'e2e4' }));
    pvs.push({ cp: 1, line: longPv });
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 20, pvs }] });

    expect(parseLichessEvalLine(line)?.lines[lastRank]?.pvUci).toHaveLength(lastRankDepth);
  });

  test('a pv.line shorter than the schedule ceiling yields exactly that many plies, not padded (Phase 49)', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 20, pvs: [{ cp: 10, line: 'e2e4 e7e5' }] }] });

    expect(parseLichessEvalLine(line)?.lines[0]?.pvUci).toEqual(['e2e4', 'e7e5']);
  });

  test('caps the kept pvs at LICHESS_EVAL_MAX_LINES', () => {
    const pvs = Array.from({ length: LICHESS_EVAL_MAX_LINES + 3 }, (_, i) => ({ cp: i, line: 'e2e4 e7e5' }));
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 10, pvs }] });

    expect(parseLichessEvalLine(line)?.lines).toHaveLength(LICHESS_EVAL_MAX_LINES);
  });

  test('parses a mate score', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ knodes: 1, depth: 30, pvs: [{ mate: -3, line: 'a7a8q' }] }] });

    expect(parseLichessEvalLine(line)).toEqual({ fen: START_FEN, depth: 30, lines: [{ cp: null, mate: -3, pvUci: ['a7a8q'] }] });
  });

  test('clamps an out-of-range cp value into int16 bounds', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ knodes: 1, depth: 10, pvs: [{ cp: 999999, line: 'e2e4' }] }] });

    expect(parseLichessEvalLine(line)?.lines[0]?.cp).toBe(32767);
  });

  test('returns null for a blank line', () => {
    expect(parseLichessEvalLine('')).toBeNull();
    expect(parseLichessEvalLine('   ')).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseLichessEvalLine('{not json')).toBeNull();
  });

  test('returns null when evals is missing or empty', () => {
    expect(parseLichessEvalLine(JSON.stringify({ fen: START_FEN }))).toBeNull();
    expect(parseLichessEvalLine(JSON.stringify({ fen: START_FEN, evals: [] }))).toBeNull();
  });

  test('returns null when every pv has neither cp nor mate', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 10, pvs: [{ line: 'e2e4' }] }] });
    expect(parseLichessEvalLine(line)).toBeNull();
  });

  test('drops a pv with both cp and mate (malformed upstream row) but keeps the other usable pvs', () => {
    const line = JSON.stringify({
      fen: START_FEN,
      evals: [
        {
          depth: 10,
          pvs: [
            { cp: 10, mate: 3, line: 'e2e4' },
            { cp: 5, line: 'd2d4' }
          ]
        }
      ]
    });
    expect(parseLichessEvalLine(line)).toEqual({ fen: START_FEN, depth: 10, lines: [{ cp: 5, mate: null, pvUci: ['d2d4'] }] });
  });
});

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

async function collect(asyncIterable) {
  const items = [];
  for await (const item of asyncIterable) items.push(item);
  return items;
}

describe('readLines', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'read-lines-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('splits a line spanning two separate stream chunks', async () => {
    const { Readable } = await import('node:stream');
    const stream = Readable.from([Buffer.from('hello wo'), Buffer.from('rld\nsecond\n')]);

    await expect(collect(readLines(stream))).resolves.toEqual(['hello world', 'second']);
  });

  test('yields a final line with no trailing newline', async () => {
    const { Readable } = await import('node:stream');
    const stream = Readable.from([Buffer.from('one\ntwo')]);

    await expect(collect(readLines(stream))).resolves.toEqual(['one', 'two']);
  });

  // Regression test: this used to go through readline.createInterface, which
  // wraps the stream in a second object whose own listeners can start after
  // the underlying stream already finished — a real, timing-dependent race
  // that silently dropped lines from small/fast files (caught by running the
  // actual build CLI against a fixture file locally, not by these tests
  // alone, since the race needs a genuine fs stream to manifest — a fake
  // AsyncIterable never exhibits it). Reading the stream's own async
  // iterator directly has no such gap. Looping guards against a regression
  // back to that race being merely low-probability rather than gone.
  test('reads every line of a real file, reliably across repeated runs', async () => {
    const filePath = join(dir, 'input.jsonl');
    const expectedLines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    await writeFile(filePath, expectedLines.join('\n') + '\n');

    for (let attempt = 0; attempt < 10; attempt++) {
      const lines = await collect(readLines(createReadStream(filePath)));
      expect(lines).toEqual(expectedLines);
    }
  });
});

describe('buildLichessEvalIndex', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'build-lichess-eval-index-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('uses the repository dataset when no input path is provided', () => {
    expect(resolveInputPath(undefined)).toBe(fileURLToPath(new URL('../data/lichess_db_eval.jsonl.zst', import.meta.url)));
    expect(resolveInputPath('/tmp/custom-eval.jsonl')).toBe('/tmp/custom-eval.jsonl');
  });

  test('builds a sorted, fixed-width index file from JSONL input, skipping unusable lines', async () => {
    const positions = [
      { fen: 'k7/8/8/8/8/8/8/KN6 w - - 0 1', cp: 10, depth: 20, moveUci: 'e2e4' },
      { fen: 'k7/8/8/8/8/8/8/K1N5 w - - 0 1', cp: -5, depth: 25, moveUci: 'd2d4' },
      { fen: 'k7/8/8/8/8/8/8/K2N4 w - - 0 1', cp: 40, depth: 30, moveUci: 'g1f3' }
    ];
    const lines = [
      ...positions.map((p) => JSON.stringify({ fen: p.fen, evals: [{ depth: p.depth, pvs: [{ cp: p.cp, line: `${p.moveUci} e7e5` }] }] })),
      'not valid json',
      ''
    ];
    const outputPath = join(dir, 'index.bin');

    const { recordCount, skippedLines } = await buildLichessEvalIndex({
      lines: asyncLines(lines),
      outputPath,
      tmpDir: join(dir, 'tmp')
    });

    expect(recordCount).toBe(3);
    expect(skippedLines).toBe(2);

    const buffer = await readFile(outputPath);
    expect(buffer.subarray(0, LICHESS_EVAL_MAGIC.length)).toEqual(LICHESS_EVAL_MAGIC);
    expect(buffer.length).toBe(LICHESS_EVAL_MAGIC.length + 3 * LICHESS_EVAL_RECORD_SIZE);

    const records = Array.from({ length: 3 }, (_, i) =>
      unpackRecord(buffer, LICHESS_EVAL_MAGIC.length + i * LICHESS_EVAL_RECORD_SIZE)
    );
    // Sorted by key, not input order — assert every input cp made it in,
    // rather than asserting a specific order this test doesn't control.
    expect(records.map((r) => r.lines[0].cp).sort((a, b) => a - b)).toEqual([-5, 10, 40]);

    for (let i = 1; i < records.length; i++) {
      expect(Buffer.compare(records[i - 1].key, records[i].key)).toBeLessThanOrEqual(0);
    }
  });

  test('produces a header-only file (no records) for input with no usable lines', async () => {
    const outputPath = join(dir, 'index.bin');

    const { recordCount } = await buildLichessEvalIndex({
      lines: asyncLines(['bad json', '']),
      outputPath,
      tmpDir: join(dir, 'tmp')
    });

    expect(recordCount).toBe(0);
    const buffer = await readFile(outputPath);
    expect(buffer).toEqual(LICHESS_EVAL_MAGIC);
  });

  test('CLI keeps its input dataset on disk after a successful build', async () => {
    const inputPath = join(dir, 'lichess_db_eval.jsonl');
    const outputPath = join(dir, 'index.bin');
    const input = JSON.stringify({
      fen: START_FEN,
      evals: [{ depth: 20, pvs: [{ cp: 10, line: 'e2e4 e7e5' }] }]
    });
    await writeFile(inputPath, `${input}\n`);

    await execFileAsync(process.execPath, [
      '--import',
      'tsx',
      fileURLToPath(new URL('./build-lichess-eval-index.mjs', import.meta.url)),
      inputPath,
      outputPath
    ]);

    await expect(readFile(inputPath, 'utf8')).resolves.toBe(`${input}\n`);
  });

  test('fixture-scale end-to-end: build -> LichessEvalIndex.open -> lookup returns every harvested ply per line (Phase 49)', async () => {
    const rank0Pv = 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4'; // 7 plies, matches scanDepthForRank(0)
    const rank1Pv = 'd2d4 d7d5 c2c4 e7e6 b1c3'; // 5 plies, matches scanDepthForRank(1)
    const line = JSON.stringify({
      fen: START_FEN,
      evals: [{ knodes: 1, depth: 45, pvs: [{ cp: 30, line: rank0Pv }, { cp: 25, line: rank1Pv }] }]
    });
    const outputPath = join(dir, 'index.bin');

    await buildLichessEvalIndex({ lines: asyncLines([line]), outputPath, tmpDir: join(dir, 'tmp') });

    const index = await LichessEvalIndex.open(outputPath);
    try {
      const result = await index.lookup(START_FEN);
      expect(result?.depth).toBe(45);
      expect(result?.lines[0]).toEqual({ cp: 30, mate: null, pvUci: rank0Pv.split(' ') });
      expect(result?.lines[1]).toEqual({ cp: 25, mate: null, pvUci: rank1Pv.split(' ') });
    } finally {
      await index.close();
    }
  });

  test('a v2-shaped fixture file is soft-skipped (a distinguishable LichessEvalIndexFormatError), not a generic crash (Phase 49)', async () => {
    const outputPath = join(dir, 'v2-stale.bin');
    await writeFile(outputPath, Buffer.concat([Buffer.from('LCEVAL02', 'ascii'), Buffer.alloc(63)]));

    await expect(LichessEvalIndex.open(outputPath)).rejects.toThrow(LichessEvalIndexFormatError);
  });
});
