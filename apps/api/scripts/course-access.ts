/**
 * Sets one user's course access level (docs/courses.md §9): 0 is none, N
 * opens the members-only courses at level N and below. The level has no
 * route; this script is the only way to set it.
 *
 *   npx tsx apps/api/scripts/course-access.ts <email> <level>
 *
 * Exits non-zero when the email is unknown.
 */
import { COURSE_MAX_ACCESS_LEVEL } from '@freechesscoach/shared';
import { createDb } from '../src/db/index.js';
import { setCourseAccessLevel } from '../src/db/repositories/users.js';

function parseArgs(args: string[]): { email: string; level: number } {
  const [email, level] = args;
  const parsed = Number(level);
  if (!email || !Number.isInteger(parsed) || parsed < 0 || parsed > COURSE_MAX_ACCESS_LEVEL) {
    throw new Error(`Usage: course-access.ts <email> <level 0-${COURSE_MAX_ACCESS_LEVEL}>`);
  }
  return { email, level: parsed };
}

async function main(): Promise<void> {
  const { email, level } = parseArgs(process.argv.slice(2));
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    const user = await setCourseAccessLevel(db, email, level);
    if (!user) {
      console.error(`No user with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${user.email} (${user.id}) courseAccessLevel=${String(user.courseAccessLevel)}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
