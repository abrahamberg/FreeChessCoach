import type { Kysely } from 'kysely';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as findingsRepo from '../db/repositories/findings.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { cascadeDeleteGame } from './games.js';

/** Permanently deletes a user and everything that hangs off their account:
 * every game via the same `cascadeDeleteGame` `deleteGameForUser` uses,
 * plus the account-scoped rows no game cascade reaches — puzzle
 * assignments/sessions/messages, focus areas, diagnostic profiles, any
 * finding left without a `gameId`, and the LLM setup (which also carries
 * its own DB-level `ON DELETE CASCADE`, see 0036_passphrase_llm_setup.ts,
 * but is deleted explicitly here to match this cascade's own discipline).
 * Wrapped in one transaction so a mid-cascade failure can't leave a
 * partially-deleted account. There is no undo. */
export async function deleteAccount(db: Kysely<Database>, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const gameIds = await gamesRepo.listIdsByUserId(trx, userId);
    for (const gameId of gameIds) {
      await cascadeDeleteGame(trx, gameId);
    }

    const puzzleSessionIds = await puzzleSessionsRepo.listSessionIdsByUserId(trx, userId);
    for (const puzzleSessionId of puzzleSessionIds) {
      await puzzleSessionsRepo.deleteMessagesBySessionId(trx, puzzleSessionId);
    }
    await puzzleSessionsRepo.deleteSessionsByUserId(trx, userId);
    await puzzleAssignmentsRepo.deleteByUserId(trx, userId);

    await findingsRepo.deleteByUserId(trx, userId);
    await focusAreasRepo.deleteByUserId(trx, userId);
    await diagnosticProfilesRepo.deleteByUserId(trx, userId);
    await llmSetupsRepo.remove(trx, userId);

    await usersRepo.remove(trx, userId);
  });
}
