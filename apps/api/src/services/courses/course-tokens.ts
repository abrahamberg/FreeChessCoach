import { createHash, randomBytes } from 'node:crypto';
import type { CourseApiToken, CourseApiTokenListResponse, CreateCourseApiTokenResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as tokensRepo from '../../db/repositories/course-api-tokens.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { AuthUser } from '../../plugins/auth-headers.js';

/** Every token starts with this, so a leaked one is easy to spot in a log or a scan. */
export const COURSE_TOKEN_PREFIX = 'fcc_';

/** A course editor's token for `/api/token/courses/*` (docs/courses.md §2):
 * shown once, only its SHA-256 is kept. */
export async function createCourseToken(db: Kysely<Database>, userId: string, name: string): Promise<CreateCourseApiTokenResponse> {
  const token = `${COURSE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const row = await tokensRepo.insert(db, { userId, name, tokenHash: hashToken(token) });
  return { ...toApiToken(row), token };
}

export async function listCourseTokens(db: Kysely<Database>, userId: string): Promise<CourseApiTokenListResponse> {
  return { tokens: (await tokensRepo.listActiveForUser(db, userId)).map(toApiToken) };
}

export async function revokeCourseToken(db: Kysely<Database>, userId: string, id: string): Promise<void> {
  if (!(await tokensRepo.revoke(db, id, userId))) throw new NotFoundError('Token not found');
}

/** The editor a presented token stands for, or null: unknown, revoked, or
 * its user may no longer edit courses. */
export async function editorForToken(db: Kysely<Database>, token: string, now = new Date()): Promise<AuthUser | null> {
  if (!token.startsWith(COURSE_TOKEN_PREFIX)) return null;
  const editor = await tokensRepo.findEditorByHash(db, hashToken(token));
  if (!editor) return null;
  await tokensRepo.touch(db, editor.tokenId, now);
  return { email: editor.email, displayName: editor.displayName };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toApiToken(row: tokensRepo.CourseApiTokenRow): CourseApiToken {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
}
