import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A Stockfish stand-in that speaks just enough UCI for UciEngine and
 * EnginePool: the handshake, MultiPV, and canned lines for the start position
 * (e4, d4, Nf3) and for a mate in one (Rh8#). It plays no chess. A search at
 * depth 40 or more answers one line and then waits for `stop`, like a search
 * cut off by its timeout. No test starts the real engine.
 */
export function fakeStockfish(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'fake-sf-')), 'stockfish');
  writeFileSync(
    path,
    `#!/usr/bin/env node
const START = ['e2e4 e7e5 g1f3', 'd2d4 d7d5 c2c4', 'g1f3 d7d5 d2d4'];
const MATE = ['h1h8'];
let fen = '';
let multiPv = 1;
let stopped;
require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'uci') console.log('uciok');
  if (line === 'isready') console.log('readyok');
  if (line === 'stop' && stopped) stopped();
  if (line.startsWith('setoption name MultiPV value ')) multiPv = Number(line.split(' ').pop());
  if (line.startsWith('position fen ')) fen = line.slice(13);
  if (!line.startsWith('go depth ')) return;
  const depth = Number(line.split(' ').pop());
  const mate = fen.startsWith('k7/');
  const pvs = mate ? MATE : START;
  for (let i = 0; i < Math.min(multiPv, pvs.length); i++) {
    const score = mate ? 'mate 1' : 'cp ' + (30 - 10 * i);
    console.log('info depth ' + Math.min(depth, 12) + ' multipv ' + (i + 1) + ' score ' + score + ' pv ' + pvs[i]);
    if (depth >= 40) break;
  }
  if (depth >= 40) stopped = () => console.log('bestmove ' + pvs[0].split(' ')[0]);
  else console.log('bestmove ' + pvs[0].split(' ')[0]);
});
`
  );
  chmodSync(path, 0o755);
  return path;
}
