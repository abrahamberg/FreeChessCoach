import type { Kysely } from 'kysely';
import type { CoachPersona, EngineMode, RatingBand, RatingSource, TtsBackend } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  ratingBand: RatingBand;
  rating: number | null;
  ratingSource: RatingSource | null;
  engineMode: EngineMode;
  coachPersona: CoachPersona;
  lichessUsername: string | null;
  chesscomUsername: string | null;
  selfAssessment: string | null;
  ttsEnabled: boolean;
  ttsBackend: TtsBackend;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  displayName: string;
  /** Omitted, most callers get the column's own DEFAULT ('native') — see
   * user-profile.ts's getOrCreate, the one production call site, which
   * passes 'chess_api' explicitly for every genuinely new signup. */
  engineMode?: EngineMode;
}

export interface UserPatch {
  // Public (UpdateUserProfileRequestSchema — the user's own nickname edit) and
  // internal (user-profile.ts's Google auto-heal path, healDisplayNameIfNeeded)
  // both write this.
  displayName?: string;
  ratingBand?: RatingBand;
  /** Only ever set together, by user-profile.ts's updateProfile when a
   * numeric rating comes in — see deriveRatingBand's doc comment for why
   * ratingBand isn't independently patchable once a rating is known. */
  rating?: number;
  ratingSource?: RatingSource;
  engineMode?: EngineMode;
  coachPersona?: CoachPersona;
  lichessUsername?: string | null;
  chesscomUsername?: string | null;
  selfAssessment?: string | null;
  ttsEnabled?: boolean;
  ttsBackend?: TtsBackend;
}

export function findByEmail(db: Kysely<Database>, email: string): Promise<UserRow | undefined> {
  return db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
}

export function findById(db: Kysely<Database>, id: string): Promise<UserRow | undefined> {
  return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
}

export function insert(db: Kysely<Database>, values: NewUser): Promise<UserRow> {
  return db.insertInto('users').values(values).returningAll().executeTakeFirstOrThrow();
}

export function update(db: Kysely<Database>, id: string, patch: UserPatch): Promise<UserRow> {
  if (Object.keys(patch).length === 0) {
    return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  }
  return db
    .updateTable('users')
    .set(patch)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}
