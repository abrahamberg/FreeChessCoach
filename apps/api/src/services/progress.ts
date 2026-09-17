import { DIAGNOSIS_CODES_BY_ID, MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import type { DiagnosisCodeId, Finding, FocusAreaUpdate, MistakeCategory, SessionOutcome } from '@freechesscoach/shared';
import { selectFocus, type DiagnosticProfileEntry, type FocusCandidate } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import * as findingsRepo from '../db/repositories/findings.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';

const MAX_ACTIVE_FOCUS_AREAS = 3;

/** end_session tool: marks the session completed. Summarize-session job
 * enqueueing is the caller's responsibility (needs the JobQueue). */
export function completeSession(db: Kysely<Database>, sessionId: string): Promise<void> {
  return sessionsRepo.markCompleted(db, sessionId);
}

export async function recordFinding(
  db: Kysely<Database>,
  userId: string,
  sessionId: string | null,
  gameId: string | null,
  finding: Finding
): Promise<findingsRepo.FindingRow> {
  assertValidCategory(finding.category);
  assertValidDiagnosisCode(finding.diagnosisCode);
  return findingsRepo.insert(db, {
    userId,
    sessionId,
    gameId,
    category: finding.category,
    severity: finding.severity,
    ply: finding.ply,
    description: finding.description,
    isPositive: finding.isPositive,
    diagnosisCode: finding.diagnosisCode ?? null,
    mechanism: finding.mechanism ?? null,
    direction: finding.direction ?? null
  });
}

export interface SessionOutcomeContext {
  userId: string;
  sessionId: string;
  gameId: string;
}

/**
 * Task 5.4: applies the progress-summarizer's validated output. Findings
 * already recorded live during the session (same category + same ply) are
 * skipped — the summarizer's job is to catch what the coach missed, not
 * duplicate it. Focus-area updates reuse applyFocusAreaUpdate's state machine
 * and max-3-active cap; summary/homework are stored on the session row.
 */
export async function applySessionOutcome(
  db: Kysely<Database>,
  ctx: SessionOutcomeContext,
  outcome: SessionOutcome
): Promise<void> {
  for (const finding of outcome.findings) {
    const alreadyRecorded = await findingsRepo.existsForSessionCategoryPly(
      db,
      ctx.sessionId,
      finding.category,
      finding.ply
    );
    if (alreadyRecorded) continue;
    await recordFinding(db, ctx.userId, ctx.sessionId, ctx.gameId, finding);
  }

  for (const update of outcome.focusAreaUpdates) {
    await applyFocusAreaUpdate(db, ctx.userId, update);
  }

  await sessionsRepo.storeSummary(db, ctx.sessionId, outcome.sessionSummary, outcome.homework);
}

export interface FocusAreaUpdateResult {
  applied: boolean;
  focusArea?: focusAreasRepo.FocusAreaRow;
  /** Set only when `applied` is false and the reason isn't the obvious
   * "no focus area at that code exists yet" — currently just the 3-active
   * cap on a `'create'` — so the coach doesn't mistake a silent no-op for
   * success. */
  reason?: string;
}

/**
 * Task 57.3 restricted this to progress/regress/resolve on a focus area the
 * system already created (a code with no existing row was a no-op, not an
 * error — the LLM could not conjure one into existence by naming it). Task
 * 64.3 restores a narrower `'create'`: real transcript evidence can now
 * start tracking a code, but it goes through the exact same
 * anti-duplication and cap checks `syncProgrammaticFocusAreas` already
 * enforces for the programmatic path — `'create'` is never a way to bypass
 * them. A `'create'` for a code that already has a row quietly folds into a
 * `'progress'` note instead of erroring or duplicating (never robotic
 * re-adds of something already tracked).
 */
export async function applyFocusAreaUpdate(
  db: Kysely<Database>,
  userId: string,
  update: FocusAreaUpdate
): Promise<FocusAreaUpdateResult> {
  assertValidDiagnosisCode(update.diagnosisCode);

  const existing = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, update.diagnosisCode);

  if (update.action === 'create') {
    if (existing) {
      const focusArea = await focusAreasRepo.updateStatusAndNote(db, existing.id, nextStatusFor('progress', existing.status), update.note);
      return { applied: true, focusArea };
    }
    return createFocusAreaFromConversation(db, userId, update.diagnosisCode, update.note);
  }

  if (!existing) return { applied: false };

  const focusArea = await focusAreasRepo.updateStatusAndNote(
    db,
    existing.id,
    nextStatusFor(update.action, existing.status),
    update.note
  );
  return { applied: true, focusArea };
}

/** Task 64.3's `'create'` branch — same cap enforcement
 * `syncProgrammaticFocusAreas` uses (a fresh `countActiveByUser` read right
 * before the write), so a conversation-created area can never push the
 * user's active set past `MAX_ACTIVE_FOCUS_AREAS`. Never auto-primary: the
 * programmatic ranking (`promoteToPrimary`, Task 64.2) decides that on the
 * next rebuild, not the moment the coach notices something in conversation. */
async function createFocusAreaFromConversation(
  db: Kysely<Database>,
  userId: string,
  diagnosisCode: DiagnosisCodeId,
  note: string
): Promise<FocusAreaUpdateResult> {
  const activeCount = await focusAreasRepo.countActiveByUser(db, userId);
  if (activeCount >= MAX_ACTIVE_FOCUS_AREAS) {
    return { applied: false, reason: `already tracking ${MAX_ACTIVE_FOCUS_AREAS} active focus areas` };
  }

  const category = DIAGNOSIS_CODES_BY_ID.get(diagnosisCode)?.parentCategory;
  if (!category) return { applied: false, reason: 'diagnosisCode has no catalog category' };

  const focusArea = await focusAreasRepo.insert(db, { userId, category, diagnosisCode, status: 'active', note });
  return { applied: true, focusArea };
}

function defaultProgrammaticNote(entry: DiagnosticProfileEntry): string {
  const failurePercent = Math.round(entry.failureRate * 100);
  return `Selected automatically from measured play: ${entry.episodes} episode(s), ${failurePercent}% failure rate, ${entry.confidence} confidence.`;
}

/**
 * Task 57.3 — the programmatic replacement for the old LLM-driven 'create'
 * action: runs Task 55.4's `selectFocus` §IV objective+overrides over
 * `candidates` (one time control's `FocusCandidate`s — a `DiagnosticProfileEntry`
 * joined with its own fired data-quality gates, the same join Task 57.2's
 * `get_diagnostic_profile` coach tool already builds via `evaluateGates`)
 * and creates a focus area for the resulting primary + secondary codes that
 * don't already have one. The max-3-active cap is enforced with a fresh
 * `countActiveByUser` read before each insert, so calling this once per time
 * control (its intended call site: `rebuild-diagnostic-profile.ts`, right
 * after each `upsertProfile`) still enforces one cap globally across a
 * user's time controls — `MAX_ACTIVE_FOCUS_AREAS` was always a per-user, not
 * per-category-or-time-control, limit.
 *
 * This resolves the previous "queued" mismatch (`progress-summarizer.ts`'s
 * old system-prompt text claimed an over-cap create was queued, while
 * `applyCreate` silently discarded it): creates are no longer LLM-proposed
 * at all, so there is nothing left for the prompt to describe — the
 * summarizer's `focusAreaUpdates` output is now progress/regress/resolve
 * only, same as the live `propose_focus_area_update` tool.
 */
export async function syncProgrammaticFocusAreas(
  db: Kysely<Database>,
  userId: string,
  candidates: readonly FocusCandidate[]
): Promise<focusAreasRepo.FocusAreaRow[]> {
  const selection = selectFocus({ candidates });
  const picks = [selection.primary, ...selection.secondary].filter(
    (entry): entry is DiagnosticProfileEntry => entry !== null
  );

  const created: focusAreasRepo.FocusAreaRow[] = [];
  for (const entry of picks) {
    const existing = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, entry.code);
    if (existing) continue;

    const activeCount = await focusAreasRepo.countActiveByUser(db, userId);
    if (activeCount >= MAX_ACTIVE_FOCUS_AREAS) break;

    const category = DIAGNOSIS_CODES_BY_ID.get(entry.code)?.parentCategory;
    if (!category) continue;

    created.push(
      await focusAreasRepo.insert(db, {
        userId,
        category,
        diagnosisCode: entry.code,
        status: 'active',
        note: defaultProgrammaticNote(entry)
      })
    );
  }

  if (selection.primary) await promoteToPrimary(db, userId, selection.primary.code);

  return created;
}

/** Task 64.2 — moves the persisted `is_primary` flag to whichever code
 * `selectFocus` just ranked first. A no-op if that row already holds it
 * (never demotes-then-repromotes the same row), and does nothing if the
 * pick has no focus-area row at all (e.g. skipped above for being over the
 * active cap) — there's nothing to flag primary yet. */
async function promoteToPrimary(db: Kysely<Database>, userId: string, code: DiagnosisCodeId): Promise<void> {
  const target = await focusAreasRepo.findByUserAndDiagnosisCode(db, userId, code);
  if (!target || target.isPrimary) return;

  const currentPrimary = await focusAreasRepo.findPrimaryByUser(db, userId);
  if (currentPrimary) await focusAreasRepo.clearPrimary(db, currentPrimary.id);
  await focusAreasRepo.setPrimary(db, target.id);
}

function nextStatusFor(
  action: 'progress' | 'regress' | 'resolve',
  current: focusAreasRepo.FocusAreaStatus
): focusAreasRepo.FocusAreaStatus {
  if (action === 'resolve') return 'resolved';
  if (action === 'regress') return 'active';
  return current === 'resolved' ? 'resolved' : 'improving';
}

function assertValidCategory(category: string): asserts category is MistakeCategory {
  if (!(MISTAKE_CATEGORIES as readonly string[]).includes(category)) {
    throw new ValidationError(`Unknown mistake category: ${category}`);
  }
}

/** AGENTS.md rule 8: no LLM output touches the DB without zod plus a closed-
 * enum check. `DiagnosisCodeIdSchema` (packages/shared) only checks format
 * (`XX-99`) — this is the actual catalog-membership gate, same treatment as
 * `assertValidCategory` above. */
function assertValidDiagnosisCode(code: DiagnosisCodeId | undefined): void {
  if (code !== undefined && !DIAGNOSIS_CODES_BY_ID.has(code)) {
    throw new ValidationError(`Unknown diagnosis code: ${code}`);
  }
}
