/**
 * One-off dev script: imports a real PGN for the dev-stub user and queues
 * real analysis (real engine + real planner LLM call via the already-running
 * `worker` container) — bypasses importGame's 10-games/day rate limit
 * (already exhausted by seed-dev-stats.ts's own inserts today) by calling
 * gamesRepo.insert + startAnalysis directly, the same way importGame does
 * internally minus that one check.
 *
 * Usage: npx tsx apps/api/scripts/import-test-game.ts <path-to-pgn-file>
 */
import { createDb } from '../src/db/index.js';
import * as analysesRepo from '../src/db/repositories/analyses.js';
import * as gamesRepo from '../src/db/repositories/games.js';
import * as usersRepo from '../src/db/repositories/users.js';
import { startAnalysis } from '../src/services/game-import.js';
import { createGraphileJobQueue } from '../src/jobs/queue.js';
import { readFileSync } from 'node:fs';

const DEV_USER_EMAIL = 'dev@local.test';

async function main(): Promise<void> {
  const pgnPath = process.argv[2];
  if (!pgnPath) throw new Error('Usage: import-test-game.ts <path-to-pgn-file>');
  const pgn = readFileSync(pgnPath, 'utf8');

  const connectionString = process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach';
  const db = createDb(connectionString);
  const jobQueueHandle = await createGraphileJobQueue(connectionString);

  const user = (await usersRepo.findByEmail(db, DEV_USER_EMAIL)) ?? (await usersRepo.insert(db, { email: DEV_USER_EMAIL, displayName: DEV_USER_EMAIL }));

  const game = await gamesRepo.insert(db, {
    userId: user.id,
    pgn,
    source: 'paste',
    userColor: 'white',
    whiteName: 'Dany_Abr',
    blackName: 'Mateo-BOT',
    result: '0-1',
    timeControl: null,
    eco: 'B20',
    playedAt: new Date('2026-08-31')
  });

  const { analysisId } = await startAnalysis(db, jobQueueHandle.queue, game.id);
  console.log(`Queued game ${game.id}, analysis ${analysisId}`);

  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const analysis = await analysesRepo.findById(db, analysisId);
    if (analysis?.status === 'ready') {
      console.log('READY');
      console.log(game.id);
      await jobQueueHandle.close();
      process.exit(0);
    }
    if (analysis?.status === 'failed') {
      console.error('FAILED:', analysis.error);
      await jobQueueHandle.close();
      process.exit(1);
    }
    console.log(`status: ${analysis?.status}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.error('Timed out waiting for analysis');
  await jobQueueHandle.close();
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
