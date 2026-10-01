import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../../src/db/index.js';
import * as analysesRepo from '../../src/db/repositories/analyses.js';
import * as gamesRepo from '../../src/db/repositories/games.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE_URL = 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';

interface Seed {
  id: string;
  readerSide: 'white' | 'black';
  note: string;
  pgn: string;
}

/** An owner's report becomes a permanent dev game: the game from the dev DB,
 * with the engine evals it was analysed with (`seeds/<id>.evals.json`), so
 * the audit reproduces exactly the sentences the owner saw. Both files are
 * committed; keep each under 50 KB (the evals are cut to 10-ply lines). */
export async function addSeed(gameId: string, note: string): Promise<string> {
  const db = createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  try {
    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new Error(`no game ${gameId} in the database`);
    const analysis = await analysesRepo.findByGameId(db, gameId);
    const evals = analysis ? await analysesRepo.findEngineEvals(db, analysis.id) : [];
    const id = `seed:${gameId.slice(0, 8)}`;
    const seedsFile = path.join(here, 'seeds.json');
    const seeds = (JSON.parse(readFileSync(seedsFile, 'utf8')) as Seed[]).filter((seed) => seed.id !== id);
    seeds.push({ id, readerSide: game.userColor, note, pgn: stripClocks(game.pgn) });
    writeFileSync(seedsFile, `${JSON.stringify(seeds, null, 2)}\n`);
    if (evals.length) {
      const slim = evals.map((each) => ({ fen: each.fen, depth: each.depth, lines: each.lines.map((line) => ({ ...line, pvSan: (line.pvSan ?? []).slice(0, 10) })) }));
      writeFileSync(path.join(here, 'seeds', `${id.replace(/^seed:/, '')}.evals.json`), `${JSON.stringify(slim)}\n`);
    }
    return `${id}: ${evals.length ? `${evals.length} stored evals kept` : 'no stored evals (a fresh search will be used)'}; run \`corpus --per-band 0\` then \`run --only ${id}\``;
  } finally {
    await db.destroy();
  }
}

function stripClocks(pgn: string): string {
  return pgn.replace(/\s*\{[^}]*\}/g, '').replace(/\d+\.\.\.\s+/g, '').replace(/[ \t]+/g, ' ');
}
