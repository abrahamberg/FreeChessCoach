/**
 * Marketing demo data: two fictional players ("Sam") in the dev database, under
 * their own emails so real dev data is never touched.
 *
 *   climber   demo-year@local.test   3,420 games over a year, rating 450 → 2130
 *   beginner  demo-week6@local.test  six weeks in, rated in the 800s
 *
 * Usage (dev stack running: `npm run dev`):
 *   npx tsx apps/api/scripts/seed-demo.ts [climber|beginner|all] [--remove]
 *
 * Re-running replaces the demo users' data. `--remove` deletes it.
 * See docs/marketing-demo.md.
 */
import { createDb } from '../src/db/index.js';
import { removeDemoUsers } from './demo/demo-user.js';
import { seedBeginner } from './demo/seed-beginner.js';
import { seedClimber } from './demo/seed-climber.js';

type Persona = 'climber' | 'beginner' | 'all';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const persona = (args.find((arg) => !arg.startsWith('--')) ?? 'all') as Persona;
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    if (args.includes('--remove')) {
      await removeDemoUsers(db);
      console.log('Removed demo users.');
      return;
    }
    if (persona === 'climber' || persona === 'all') await seedClimber(db, new Date());
    if (persona === 'beginner' || persona === 'all') await seedBeginner(db, new Date(), process.env.API_URL ?? 'http://localhost:3000');
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
