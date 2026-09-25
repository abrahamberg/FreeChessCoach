import { deriveRatingBand } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as usersRepo from '../../src/db/repositories/users.js';
import type { UserRow } from '../../src/db/repositories/users.js';
import type { Database } from '../../src/db/schema.js';
import { deleteAccount } from '../../src/services/account.js';

/** Demo users live in the same database as the dev user but under their own
 * emails, so seeding never touches real dev data. The `.test` TLD is reserved
 * (RFC 2606), so these can never be a real person's address. */
export const DEMO_EMAILS = { climber: 'demo-year@local.test', beginner: 'demo-week6@local.test' } as const;

export const DEMO_DISPLAY_NAME = 'Sam';
export const DEMO_HANDLE = 'sam_climbs';

/** Removes any previous demo data for `email`, then creates the user fresh —
 * so the script is safe to re-run. */
export async function createFreshDemoUser(db: Kysely<Database>, email: string, rating: number): Promise<UserRow> {
  const existing = await usersRepo.findByEmail(db, email);
  if (existing) {
    await deleteAccount(db, existing.id);
  }
  const user = await usersRepo.insert(db, { email, displayName: DEMO_DISPLAY_NAME, engineMode: 'native' });
  return usersRepo.update(db, user.id, {
    rating,
    ratingBand: deriveRatingBand(rating),
    ratingSource: 'estimated',
    lichessUsername: DEMO_HANDLE,
    onboardedAt: new Date()
  });
}

export async function removeDemoUsers(db: Kysely<Database>): Promise<void> {
  for (const email of Object.values(DEMO_EMAILS)) {
    const user = await usersRepo.findByEmail(db, email);
    if (user) await deleteAccount(db, user.id);
  }
}
