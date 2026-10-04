import type { Kysely } from 'kysely';
import type { DiagnosisCodeId, MistakeCategory } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export type FocusAreaStatus = 'active' | 'improving' | 'graduated';

export interface FocusAreaRow {
  id: string;
  userId: string;
  category: MistakeCategory;
  diagnosisCode: DiagnosisCodeId | null;
  status: FocusAreaStatus;
  note: string;
  evidenceCount: number;
  lastSeenAt: Date;
  createdAt: Date;
  isPrimary: boolean;
  /** Set while the area is on the improved list. */
  graduatedAt: Date | null;
}

/** Legacy lookup for category-only rows created before Task 57.3 — new
 * focus areas are always keyed by `diagnosisCode` (see `findByUserAndDiagnosisCode`)
 * since several active areas can now share one broad category. */
export function findByUserAndCategory(
  db: Kysely<Database>,
  userId: string,
  category: MistakeCategory
): Promise<FocusAreaRow | undefined> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .where('category', '=', category)
    .executeTakeFirst();
}

/** Task 57.3 — the addressing lookup `applyFocusAreaUpdate` and
 * `syncProgrammaticFocusAreas` use: `UNIQUE (user_id, diagnosis_code)` makes
 * this the correct one-row lookup now that several active areas can share a
 * broad category. */
export function findByUserAndDiagnosisCode(
  db: Kysely<Database>,
  userId: string,
  diagnosisCode: DiagnosisCodeId
): Promise<FocusAreaRow | undefined> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .where('diagnosisCode', '=', diagnosisCode)
    .executeTakeFirst();
}

export async function countActiveByUser(db: Kysely<Database>, userId: string): Promise<number> {
  const result = await db
    .selectFrom('focusAreas')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('userId', '=', userId)
    .where('status', '=', 'active')
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

export interface NewFocusArea {
  userId: string;
  category: MistakeCategory;
  diagnosisCode: DiagnosisCodeId | null;
  status: FocusAreaStatus;
  note: string;
}

export function insert(db: Kysely<Database>, values: NewFocusArea): Promise<FocusAreaRow> {
  const graduatedAt = values.status === 'graduated' ? new Date() : null;
  return db.insertInto('focusAreas').values({ ...values, graduatedAt }).returningAll().executeTakeFirstOrThrow();
}

export function updateStatusAndNote(
  db: Kysely<Database>,
  id: string,
  status: FocusAreaStatus,
  note: string
): Promise<FocusAreaRow> {
  return db
    .updateTable('focusAreas')
    .set((eb) => ({
      status,
      note,
      lastSeenAt: new Date(),
      graduatedAt: status === 'graduated' ? new Date() : null,
      evidenceCount: eb('evidenceCount', '+', 1)
    }))
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Rebuild-driven refresh of a programmatic area: new measured note and
 * evidence total, never the status (that's the coach's/summariser's call).
 * `evidenceCount` only ever grows — conversation updates bump it too. */
export function refreshMeasuredEvidence(
  db: Kysely<Database>,
  id: string,
  note: string,
  episodes: number
): Promise<FocusAreaRow> {
  return db
    .updateTable('focusAreas')
    .set((eb) => ({
      note,
      lastSeenAt: new Date(),
      evidenceCount: eb.fn('greatest', ['evidenceCount', eb.val(episodes)])
    }))
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Active + improving areas — what the coach's system prompt and
 * get_user_profile show. Primary first (Task 64.2 — makes the persisted
 * rank actually visible instead of an incidental recency order), then most
 * recently touched. */
export function listActiveAndImproving(
  db: Kysely<Database>,
  userId: string
): Promise<FocusAreaRow[]> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .where('status', 'in', ['active', 'improving'])
    .orderBy('isPrimary', 'desc')
    .orderBy('lastSeenAt', 'desc')
    .execute();
}

/** Task 64.2 — the row currently flagged primary, if any. At most one per
 * user, enforced app-level by `progress.ts`'s `promoteToPrimary`. */
export function findPrimaryByUser(db: Kysely<Database>, userId: string): Promise<FocusAreaRow | undefined> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .where('isPrimary', '=', true)
    .executeTakeFirst();
}

export function setPrimary(db: Kysely<Database>, id: string): Promise<FocusAreaRow> {
  return db.updateTable('focusAreas').set({ isPrimary: true }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
}

export function clearPrimary(db: Kysely<Database>, id: string): Promise<FocusAreaRow> {
  return db.updateTable('focusAreas').set({ isPrimary: false }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
}

/** Every area the student has ever had, whatever its status — what the progress
 * dossier reads. Active and improving first, primary leading, then the
 * graduated ones newest first. */
export function listAllByUser(db: Kysely<Database>, userId: string): Promise<FocusAreaRow[]> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy((eb) => eb.case().when('status', '=', 'graduated').then(1).else(0).end())
    .orderBy('isPrimary', 'desc')
    .orderBy('lastSeenAt', 'desc')
    .execute();
}

/** The improved list: the dashboard's "Graduated ✓" accordion and the coach's
 * dossier, newest graduate first. */
export function listGraduated(db: Kysely<Database>, userId: string): Promise<FocusAreaRow[]> {
  return db
    .selectFrom('focusAreas')
    .selectAll()
    .where('userId', '=', userId)
    .where('status', '=', 'graduated')
    .orderBy('graduatedAt', 'desc')
    .execute();
}

/** services/account.ts's deletion cascade — focus areas aren't game-scoped,
 * so no per-game cascade ever reaches them. */
export function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  return db.deleteFrom('focusAreas').where('userId', '=', userId).execute().then(() => undefined);
}
