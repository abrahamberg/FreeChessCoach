/* global console, process */
/**
 * Dev tool: plays weak, human-looking games with the dev stack's Stockfish, to
 * be committed as fixtures under ./games and imported through the real API by
 * seed-demo.ts (so the marketing screenshots show genuine engine analysis).
 *
 * Skill Level 0 plus a rank lottery over MultiPV 5 gives the missed forks,
 * hung pieces and back-rank slips of a ~800 player.
 *
 *   node apps/api/scripts/demo/generate-beginner-games.mjs <count> [seed] [outDir]
 */
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENING_LINES = [
  { name: 'italian', as: 'white', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6' },
  { name: 'london', as: 'white', moves: 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6' },
  { name: 'caro', as: 'black', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6' },
  { name: 'scotch', as: 'white', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6' }
];
/** Nearly flat: every one of the engine's top five moves is about as likely as the next. */
const RANK_WEIGHTS = [0.22, 0.22, 0.2, 0.18, 0.18];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startEngine() {
  const proc = spawn('docker', ['exec', '-i', 'chess-ai-coach-engine-1', '/usr/games/stockfish']);
  let buffer = '';
  const waiters = [];
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    for (const waiter of [...waiters]) if (waiter.test(buffer)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(); }
  });
  const send = (line) => proc.stdin.write(`${line}\n`);
  const until = (test) => new Promise((resolve) => { const waiter = { test, resolve }; waiters.push(waiter); if (test(buffer)) { waiters.splice(waiters.indexOf(waiter), 1); resolve(); } });
  return { send, until, take: () => { const out = buffer; buffer = ''; return out; }, close: () => proc.kill() };
}

async function choose(engine, fen, rng) {
  engine.take();
  engine.send(`position fen ${fen}`);
  engine.send('go movetime 25');
  await engine.until((b) => /bestmove/.test(b));
  const output = engine.take();
  const lines = new Map();
  for (const m of output.matchAll(/info depth (\d+).*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (\S+)/g)) lines.set(Number(m[2]), { uci: m[5], score: m[3] === 'mate' ? Math.sign(Number(m[4])) * 10000 : Number(m[4]) });
  const ranked = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line);
  let roll = rng();
  let index = 0;
  for (; index < ranked.length - 1; index++) { roll -= RANK_WEIGHTS[index]; if (roll < 0) break; }
  return { move: ranked[index].uci, score: ranked[0].score };
}

async function playGame(engine, opening, rng, user, opponent, date) {
  const chess = new Chess();
  for (const san of opening.moves.split(' ')) chess.move(san);
  let hopeless = 0;
  let result = '1/2-1/2';
  while (chess.history().length < 150) {
    if (chess.isCheckmate()) { result = chess.turn() === 'w' ? '0-1' : '1-0'; break; }
    if (chess.isDraw() || chess.isStalemate()) { result = '1/2-1/2'; break; }
    const { move, score } = await choose(engine, chess.fen(), rng);
    const whiteScore = chess.turn() === 'w' ? score : -score;
    hopeless = Math.abs(whiteScore) > 700 ? hopeless + 1 : 0;
    if (hopeless >= 8) { result = whiteScore > 0 ? '1-0' : '0-1'; break; }
    chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  }
  const [white, black] = opening.as === 'white' ? [user, opponent] : [opponent, user];
  chess.header('Event', 'Rated Rapid game', 'Site', 'https://lichess.org/', 'Date', date, 'White', white, 'Black', black, 'Result', result, 'TimeControl', '600+0', 'WhiteElo', opening.as === 'white' ? '842' : '811', 'BlackElo', opening.as === 'white' ? '811' : '842', 'Termination', 'Normal');
  return { pgn: chess.pgn(), plies: chess.history().length, result };
}

const count = Number(process.argv[2] ?? 6);
const rng = mulberry32(Number(process.argv[3] ?? 11));
const outDir = process.argv[4] ?? join(dirname(fileURLToPath(import.meta.url)), 'games');
mkdirSync(outDir, { recursive: true });
const engine = startEngine();
engine.send('uci'); await engine.until((b) => /uciok/.test(b));
engine.send('setoption name Skill Level value 0');
engine.send('setoption name MultiPV value 5');
engine.send('isready'); await engine.until((b) => /readyok/.test(b));
for (let i = 0; i < count; i++) {
  const opening = OPENING_LINES[i % OPENING_LINES.length];
  const opponent = ['rook_lifter', 'sneaky_owl42', 'quietmonk', 'blitzfox7', 'happy_pawn', 'ironwolf'][i % 6];
  const day = String(18 - Math.floor(i / 2) * 2).padStart(2, '0');
  const game = await playGame(engine, opening, rng, 'sam_climbs', opponent, `2026.09.${day}`);
  const file = join(outDir, `candidate-${i + 1}-${opening.name}.pgn`);
  writeFileSync(file, `${game.pgn}\n`);
  console.log(file, game.plies, 'plies', game.result);
}
engine.close();
