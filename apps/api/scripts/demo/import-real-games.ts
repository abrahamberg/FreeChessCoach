import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../../src/db/repositories/analyses.js';
import type { Database } from '../../src/db/schema.js';
import { playedAtFor, REAL_GAMES, withPlayedAt, type RealGameKey } from './real-games.js';

const GAMES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'games');
const POLL_MS = 2000;
const TIMEOUT_MS = 12 * 60 * 1000;

/** Imports the committed fixture games through the real HTTP API as the given
 * user, so the worker analyzes them with the real engine and the marketing
 * screenshots show genuine Game Review output. Needs the dev stack running.
 * Returns each fixture's game id, keyed as in real-games.ts. */
export async function importRealGames(db: Kysely<Database>, apiUrl: string, email: string, now: Date): Promise<Record<RealGameKey, string>> {
  const ids = {} as Record<RealGameKey, string>;
  for (const spec of REAL_GAMES) {
    const pgn = withPlayedAt(readFileSync(join(GAMES_DIR, spec.file), 'utf8'), playedAtFor(spec, now));
    const response = await fetch(`${apiUrl}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-email': email },
      body: JSON.stringify({ pgn, source: 'lichess' })
    });
    if (!response.ok) throw new Error(`Import of ${spec.file} failed: ${response.status} ${await response.text()}`);
    ids[spec.key] = ((await response.json()) as { gameId: string }).gameId;
  }
  for (const spec of REAL_GAMES) await waitUntilAnalyzed(db, ids[spec.key], spec.file);
  return ids;
}

async function waitUntilAnalyzed(db: Kysely<Database>, gameId: string, file: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const analysis = await analysesRepo.findByGameId(db, gameId);
    if (analysis?.status === 'ready') return;
    if (analysis?.status === 'failed') throw new Error(`Analysis of ${file} failed: ${analysis.error}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for the analysis of ${file}`);
}
