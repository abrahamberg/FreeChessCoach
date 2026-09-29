import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolveTestStockfishPath } from '../test/helpers/stockfish-path.js';
import { pvUciToSan, UciEngine } from './uci.js';

const STOCKFISH_PATH = resolveTestStockfishPath();
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MATE_IN_ONE_FEN = 'k7/8/1K6/8/8/8/8/7R w - - 0 1';

describe('UciEngine', () => {
  let engine: UciEngine;

  beforeAll(() => {
    engine = new UciEngine({ stockfishPath: STOCKFISH_PATH });
  });

  afterAll(async () => {
    await engine.quit();
  });

  test('analyzes the start position and returns a plausible best move', async () => {
    const lines = await engine.analyze(START_FEN, { depth: 8, multiPv: 1 });

    expect(lines).toHaveLength(1);
    expect(['e4', 'd4', 'Nf3', 'c4']).toContain(lines[0]?.moveSan);
    expect(lines[0]?.moveUci).toHaveLength(4);
  }, 20000);

  test('reports a forced mate in 1', async () => {
    const lines = await engine.analyze(MATE_IN_ONE_FEN, { depth: 6, multiPv: 1 });

    expect(lines[0]?.mateIn).toBe(1);
    expect(lines[0]?.moveSan).toBe('Rh8#');
    expect(lines[0]?.cp).toBeNull();
  }, 20000);

  test('never rejects on timeout — returns best-so-far lines instead', async () => {
    const lines = await engine.analyze(START_FEN, { depth: 40, multiPv: 1, timeoutMs: 200 });

    expect(lines.length).toBeGreaterThan(0);
    expect(typeof lines[0]?.moveSan).toBe('string');
  }, 20000);

  test('analyzeDetailed keeps the full principal variation', async () => {
    const [detailed] = await engine.analyzeDetailed(START_FEN, { depth: 8, multiPv: 1 });

    expect(detailed?.pvUci.length).toBeGreaterThan(1);
    expect(detailed?.pvUci[0]).toBe(detailed?.moveUci);
  }, 20000);

  test('analyze() strips the principal variation that analyzeDetailed keeps', async () => {
    // Same single call underneath (search() is shared) — asserting the
    // shapes differ without running two independent Stockfish searches,
    // which can return slightly different scores at shallow depth.
    const [plain] = await engine.analyze(START_FEN, { depth: 8, multiPv: 1 });

    expect(plain).not.toHaveProperty('pvUci');
    expect(plain).toEqual({ moveUci: plain?.moveUci, moveSan: plain?.moveSan, cp: plain?.cp, mateIn: plain?.mateIn });
  }, 20000);
});

describe('pvUciToSan', () => {
  test('converts a full UCI principal variation to SAN in order', () => {
    const sans = pvUciToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3']);
    expect(sans).toEqual(['e4', 'e5', 'Nf3']);
  });

  test('stops at the first illegal move rather than throwing', () => {
    const sans = pvUciToSan(START_FEN, ['e2e4', 'e2e4']);
    expect(sans).toEqual(['e4']);
  });

  test('returns an empty array for an empty PV', () => {
    expect(pvUciToSan(START_FEN, [])).toEqual([]);
  });
});

/** A Stockfish stand-in that dies mid-search, as 15.1 segfaults on a
 * position whose side not to move is in check: it answers the handshake,
 * prints one depth-1 line (or none), and exits on the positions it is told to. */
function crashingStockfish(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'fake-sf-')), 'stockfish');
  writeFileSync(
    path,
    `#!/usr/bin/env node
let fen = '';
require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'uci') console.log('uciok');
  if (line === 'isready') console.log('readyok');
  if (line.startsWith('position fen ')) fen = line.slice(13);
  if (!line.startsWith('go')) return;
  if (fen.includes('4n3')) { console.log('info depth 1 multipv 1 score cp -266 pv h1g2'); setTimeout(() => process.exit(139), 20); return; }
  if (fen.includes('3n4')) { process.exit(139); }
  console.log('info depth 12 multipv 1 score cp 30 pv e2e4');
  console.log('bestmove e2e4');
});
`
  );
  chmodSync(path, 0o755);
  return path;
}

describe('UciEngine when Stockfish crashes', () => {
  test('the search in flight settles with its lines so far, or fails when it has none; the next search spawns a fresh process', async () => {
    const engine = new UciEngine({ stockfishPath: crashingStockfish() });
    const partial = await engine.analyze('8/8/1P6/4n3/3K4/8/8/7k b - - 0 1', { multiPv: 3 });
    expect(partial.map((line) => line.moveSan)).toEqual(['Kg2']);
    await expect(engine.analyze('8/3n4/1P6/8/2K5/8/8/7k w - - 1 2')).rejects.toThrow('stockfish exited');
    const next = await engine.analyze(START_FEN);
    expect(next[0]?.moveSan).toBe('e4');
    await engine.quit();
  });
});

