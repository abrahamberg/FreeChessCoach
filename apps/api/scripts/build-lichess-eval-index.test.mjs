/* global Buffer */
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LICHESS_EVAL_RECORD_SIZE, unpackRecord } from '@freechesscoach/chess-analysis/lichess-eval-index-format';
import { buildLichessEvalIndex, parseLichessEvalLine, readLines } from './build-lichess-eval-index.mjs';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parseLichessEvalLine', () => {
  test('picks the deepest evals entry and its first pv', () => {
    const line = JSON.stringify({
      fen: START_FEN,
      evals: [
        { knodes: 100, depth: 20, pvs: [{ cp: 10, line: 'd2d4 d7d5' }] },
        { knodes: 500, depth: 40, pvs: [{ cp: 30, line: 'e2e4 e7e5 g1f3' }] }
      ]
    });

    expect(parseLichessEvalLine(line)).toEqual({ fen: START_FEN, cp: 30, mate: null, depth: 40, moveUci: 'e2e4' });
  });

  test('parses a mate score', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ knodes: 1, depth: 30, pvs: [{ mate: -3, line: 'a7a8q' }] }] });

    expect(parseLichessEvalLine(line)).toEqual({ fen: START_FEN, cp: null, mate: -3, depth: 30, moveUci: 'a7a8q' });
  });

  test('clamps an out-of-range cp value into int16 bounds', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ knodes: 1, depth: 10, pvs: [{ cp: 999999, line: 'e2e4' }] }] });

    expect(parseLichessEvalLine(line)?.cp).toBe(32767);
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

  test('returns null when a pv has neither cp nor mate', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 10, pvs: [{ line: 'e2e4' }] }] });
    expect(parseLichessEvalLine(line)).toBeNull();
  });

  test('returns null when a pv has both cp and mate (malformed upstream row)', () => {
    const line = JSON.stringify({ fen: START_FEN, evals: [{ depth: 10, pvs: [{ cp: 10, mate: 3, line: 'e2e4' }] }] });
    expect(parseLichessEvalLine(line)).toBeNull();
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
    expect(buffer.length).toBe(3 * LICHESS_EVAL_RECORD_SIZE);

    const records = Array.from({ length: 3 }, (_, i) => unpackRecord(buffer, i * LICHESS_EVAL_RECORD_SIZE));
    // Sorted by key, not input order — assert every input cp made it in,
    // rather than asserting a specific order this test doesn't control.
    expect(records.map((r) => r.cp).sort((a, b) => a - b)).toEqual([-5, 10, 40]);

    for (let i = 1; i < records.length; i++) {
      expect(Buffer.compare(records[i - 1].key, records[i].key)).toBeLessThanOrEqual(0);
    }
  });

  test('produces an empty file for input with no usable lines', async () => {
    const outputPath = join(dir, 'index.bin');

    const { recordCount } = await buildLichessEvalIndex({
      lines: asyncLines(['bad json', '']),
      outputPath,
      tmpDir: join(dir, 'tmp')
    });

    expect(recordCount).toBe(0);
    const buffer = await readFile(outputPath);
    expect(buffer.length).toBe(0);
  });
});
