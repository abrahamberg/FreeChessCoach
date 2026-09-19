import type { Kysely } from 'kysely';
import * as gamesRepo from '../../src/db/repositories/games.js';
import type { Database } from '../../src/db/schema.js';
import { BEGINNER_LESSONS } from './beginner-lessons.js';
import { createFreshDemoUser, DEMO_EMAILS, DEMO_HANDLE } from './demo-user.js';
import { planGames, type PlannedGame } from './game-plan.js';
import { importRealGames } from './import-real-games.js';
import { insertAnalyzedGame, lessonStart } from './insert-planned-game.js';
import { mulberry32 } from './rng.js';
import {
  clearComputedProgress,
  PROFILE_TIME_CONTROL,
  seedDiagnosticProfile,
  seedFeaturedConversation,
  seedFindings,
  seedFocusAreas,
  seedLesson,
  seedPracticeSets
} from './seed-beginner-progress.js';
import { playedAtFor, REAL_GAMES } from './real-games.js';

const BEGINNER_SEED = 830;
const BEGINNER_RATING = 830;
const JOURNEY_DAY = 34;
const PLANNED_GAMES = 250;
/** Time for the worker's follow-up jobs (deepen analysis, profile rebuild) to finish
 * writing before the hand-written progress replaces theirs. */
const SETTLE_MS = 60_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface InsertedPlanned {
  game: PlannedGame;
  gameId: string;
}

function nearestPlannedGame(planned: InsertedPlanned[], daysAgo: number, result: 'win' | 'loss'): InsertedPlanned {
  const wantedDay = JOURNEY_DAY - daysAgo;
  const candidates = planned.filter((entry) => entry.game.result === result);
  return candidates.reduce((best, entry) => (Math.abs(entry.game.day - wantedDay) < Math.abs(best.game.day - wantedDay) ? entry : best));
}

/** Six weeks in, rated in the 800s: 250 games, five of them real engine-analyzed
 * games with a coaching session on each lesson, and the coach's picture of what to work on. */
export async function seedBeginner(db: Kysely<Database>, now: Date, apiUrl: string): Promise<void> {
  const user = await createFreshDemoUser(db, DEMO_EMAILS.beginner, BEGINNER_RATING);
  const plan = planGames(mulberry32(BEGINNER_SEED), PLANNED_GAMES, now, JOURNEY_DAY);
  const planned: InsertedPlanned[] = [];
  for (const [index, game] of plan.entries()) {
    planned.push({ game, gameId: await insertAnalyzedGame(db, user.id, DEMO_HANDLE, game, BEGINNER_SEED * 1000 + index) });
  }
  console.log(`beginner: ${planned.length} planned games; importing ${REAL_GAMES.length} real games and waiting for the engine...`);

  const realIds = await importRealGames(db, apiUrl, DEMO_EMAILS.beginner, now);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  await clearComputedProgress(db, user.id);

  for (const lesson of BEGINNER_LESSONS) {
    const target =
      lesson.game === 'planned'
        ? (() => {
            const pick = nearestPlannedGame(planned, lesson.daysAgo, lesson.result);
            return { gameId: pick.gameId, startedAt: lessonStart(pick.game) };
          })()
        : (() => {
            const spec = REAL_GAMES.find((real) => real.key === lesson.game)!;
            return { gameId: realIds[spec.key], startedAt: new Date(playedAtFor(spec, now).getTime() + 40 * 60 * 1000) };
          })();
    const sessionId = await seedLesson(db, user.id, lesson, target);
    if (lesson.game === 'featured') await seedFeaturedConversation(db, sessionId);
  }

  const recent = (await gamesRepo.listByUser(db, user.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
  await seedFindings(db, user.id, recent.map((row) => row.id));
  await seedFocusAreas(db, user.id);
  await seedDiagnosticProfile(db, user.id, new Date(now.getTime() - MS_PER_DAY / 24));
  await seedPracticeSets(db, user.id, BEGINNER_RATING);
  console.log(`beginner: done (${PROFILE_TIME_CONTROL} profile, ${BEGINNER_LESSONS.length} lessons)`);
}
