import type { Kysely } from 'kysely';
import { deriveRatingBand, type UpdateUserProfileRequest, type UserProfile } from '@freechesscoach/shared';
import * as creditsRepo from '../db/repositories/credits.js';
import * as findingsRepo from '../db/repositories/findings.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { looksLikeOpaqueId } from '../lib/display-name.js';

const RECENT_FINDINGS_LIMIT = 15;
const RECENT_GAMES_FOR_COUNTS = 20;

export interface Identity {
  email: string;
  displayName: string;
}

/** Finds the user by email, or creates them with a one-time 100-credit signup
 * grant (inserted atomically with the user row). Safe to call on every request.
 *
 * engineMode defaults to 'chess_api' here — not in the users table's own
 * DEFAULT — so this is the one place that speaks for "what a brand-new user
 * gets," while every other row-creation path (test fixtures, seeds) keeps
 * getting the column's 'native' default undisturbed. */
export async function getOrCreate(
  db: Kysely<Database>,
  identity: Identity
): Promise<usersRepo.UserRow> {
  const existing = await usersRepo.findByEmail(db, identity.email);
  if (existing) return healDisplayNameIfNeeded(db, existing, identity.displayName);

  return db.transaction().execute(async (trx) => {
    const user = await usersRepo.insert(trx, { ...identity, engineMode: 'chess_api' });
    await creditsRepo.insertSignupGrant(trx, user.id);
    return user;
  });
}

/** Repairs profiles created before the Google-login display-name fix (a raw
 * Google account id stored as the name, see lib/display-name.ts) the next time
 * that user signs back in. displayName is user-editable now (PATCH
 * /api/users/me), so this only fires on the 15+-digit opaque-id shape
 * (looksLikeOpaqueId) — implausible for a hand-picked nickname — to avoid
 * clobbering a deliberate one. */
function healDisplayNameIfNeeded(
  db: Kysely<Database>,
  existing: usersRepo.UserRow,
  freshDisplayName: string
): Promise<usersRepo.UserRow> {
  const needsHealing = looksLikeOpaqueId(existing.displayName) && freshDisplayName !== existing.displayName;
  if (!needsHealing) return Promise.resolve(existing);
  return usersRepo.update(db, existing.id, { displayName: freshDisplayName });
}

/** A numeric `rating` in the request is always self-reported (this is the
 * user's own profile edit — nothing else calls this with a rating): it's
 * stamped `ratingSource: 'self'` here rather than trusting a client-supplied
 * source, and re-derives `ratingBand` from it, taking priority over a
 * `ratingBand` also present in the same request (see deriveRatingBand). */
export function updateProfile(
  db: Kysely<Database>,
  userId: string,
  patch: UpdateUserProfileRequest
): Promise<usersRepo.UserRow> {
  if (patch.rating === undefined) return usersRepo.update(db, userId, patch);
  return usersRepo.update(db, userId, {
    ...patch,
    rating: patch.rating,
    ratingSource: 'self',
    ratingBand: deriveRatingBand(patch.rating)
  });
}

export interface ProfileSummary {
  focusAreas: focusAreasRepo.FocusAreaRow[];
  recentFindings: findingsRepo.FindingRow[];
  findingCounts: Record<string, number>;
  sessionCount: number;
}

/** Powers the coach system prompt (packages/prompts) and the get_user_profile
 * tool (architecture §7.1) — never raw rows, only this pre-shaped summary. */
export async function getProfileSummary(db: Kysely<Database>, userId: string): Promise<ProfileSummary> {
  const [focusAreas, recentFindings, findingCounts, sessionCount] = await Promise.all([
    focusAreasRepo.listActiveAndImproving(db, userId),
    findingsRepo.listRecentByUser(db, userId, RECENT_FINDINGS_LIMIT),
    findingsRepo.countByCategoryForRecentGames(db, userId, RECENT_GAMES_FOR_COUNTS),
    sessionsRepo.countByUser(db, userId)
  ]);
  return { focusAreas, recentFindings, findingCounts, sessionCount };
}

export async function toUserProfile(
  db: Kysely<Database>,
  user: usersRepo.UserRow
): Promise<UserProfile> {
  const creditBalance = await creditsRepo.balance(db, user.id);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    ratingBand: user.ratingBand,
    rating: user.rating,
    ratingSource: user.ratingSource,
    engineMode: user.engineMode,
    coachPersona: user.coachPersona,
    lichessUsername: user.lichessUsername,
    chesscomUsername: user.chesscomUsername,
    selfAssessment: user.selfAssessment,
    creditBalance,
    ttsEnabled: user.ttsEnabled,
    ttsBackend: user.ttsBackend
  };
}
