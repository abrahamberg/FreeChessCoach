/**
 * Switches course creation on or off for one user (docs/courses.md §2). The
 * flag has no route; this script is the only way to set it.
 *
 *   npx tsx apps/api/scripts/course-creator.ts grant|revoke <email>
 *
 * Exits non-zero when the email is unknown.
 */
import { createDb } from '../src/db/index.js';
import { setCanCreateCourses } from '../src/db/repositories/users.js';

function parseArgs(args: string[]): { value: boolean; email: string } {
  const [action, email] = args;
  if ((action !== 'grant' && action !== 'revoke') || !email) {
    throw new Error('Usage: course-creator.ts grant|revoke <email>');
  }
  return { value: action === 'grant', email };
}

async function main(): Promise<void> {
  const { value, email } = parseArgs(process.argv.slice(2));
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    const user = await setCanCreateCourses(db, email, value);
    if (!user) {
      console.error(`No user with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${user.email} (${user.id}) canCreateCourses=${String(user.canCreateCourses)}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
