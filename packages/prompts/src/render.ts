import { DIAGNOSTIC_DETECTORS, plyToMoveRef } from '@freechesscoach/chess-analysis';
import { ALL_DIAGNOSIS_CODES, MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import type { CoachingPlan, DiagnosisCodeId, MistakeCategory, Thread } from '@freechesscoach/shared';

export const MISTAKE_CATEGORIES_BLOCK = MISTAKE_CATEGORIES.join(', ');

const FOCUS_AREAS_EMPTY_FALLBACK = '(none yet — this is early in your work together)';
const RECENT_FINDINGS_EMPTY_FALLBACK = '(none yet — no findings recorded so far)';
const SCOPED_DIAGNOSIS_CODES_EMPTY_FALLBACK =
  '(no catalog codes are scoped to this student yet — leave diagnosisCode unset and use the category list above instead)';

/** Every code with a real detector (Task 53+) — grounded by measured
 * evidence (`get_diagnostic_profile`), not just conversation. Computed once,
 * not per call — `DIAGNOSTIC_DETECTORS` is a fixed module-level registry,
 * not per-request data. */
export const ACTIVE_DETECTOR_CODES: ReadonlySet<DiagnosisCodeId> = new Set(
  DIAGNOSTIC_DETECTORS.map((detector) => detector.code)
);

/** Task 65.1's per-category cap — similar order of magnitude to
 * `ACTIVE_DETECTOR_CODES`, not "every dialogue code" (360 of them, which
 * Task 57.4 ruled out for exactly the reason `ACTIVE_DIALOGUE_CODES`'s own
 * doc comment below explains). */
const DIALOGUE_CODES_PER_CATEGORY = 3;

/**
 * Task 65.1 — root cause of "general diagnosis instead of a real one": the
 * ~360 `detectability: 'dialogue'` codes are exactly what a live
 * conversation reveals (a student describing their own thinking, not
 * something an engine detector measures), but until now NONE of them were
 * ever listed as pickable options anywhere — only the ~30 detector-backed
 * codes were, structurally excluding most of what a lesson actually
 * produces. Task 57.4's original constraint still holds (all 360 would blow
 * the cache/token budget for no benefit), so this is a curated, bounded
 * subset: up to `DIALOGUE_CODES_PER_CATEGORY` per `parentCategory`, so
 * every mistake category the coach might discuss has a few nameable
 * options, not just the categories that happen to have an engine detector.
 * Within a category, widest `ratingPrior` span first (broadest applicability
 * across students), id ascending to break ties — deterministic, no manual
 * per-code curation to keep in sync as the catalog changes. */
export const ACTIVE_DIALOGUE_CODES: ReadonlySet<DiagnosisCodeId> = new Set(
  MISTAKE_CATEGORIES.flatMap((category) =>
    ALL_DIAGNOSIS_CODES.filter((entry) => entry.parentCategory === category && entry.detectability === 'dialogue')
      .sort((a, b) => b.ratingPrior[1] - b.ratingPrior[0] - (a.ratingPrior[1] - a.ratingPrior[0]) || a.id.localeCompare(b.id))
      .slice(0, DIALOGUE_CODES_PER_CATEGORY)
      .map((entry) => entry.id)
  )
);

/** Task 65.2 — the union every caller actually wants: detector codes (hard
 * measured evidence) plus the curated dialogue set (conversation-revealable
 * patterns), never a replacement of one by the other. */
export const ACTIVE_DIAGNOSIS_CODES: ReadonlySet<DiagnosisCodeId> = new Set([
  ...ACTIVE_DETECTOR_CODES,
  ...ACTIVE_DIALOGUE_CODES
]);

/**
 * docs/diagnose.md §0.1: a code's `ratingPrior` is the interval where it's
 * "most likely to be a primary, high-value coaching diagnosis," not an
 * exclusive cutoff — this filters to that operational window rather than
 * trying to model the wider penumbra the spec describes in prose. Scoped to
 * whatever `activeCodes` the caller passes — Task 65.1 broadened every
 * caller to a union of `ACTIVE_DETECTOR_CODES` and `ACTIVE_DIALOGUE_CODES`,
 * so this no longer hard-codes `detectability === 'detector'` itself: the
 * passed-in set is the one place that decides what's in scope. Pure and
 * rating-only so a caller can place it in whichever cache tier (static per
 * rating band, or dynamic per numeric rating) actually matches how it's
 * computing `rating`.
 */
export function renderScopedDiagnosisCodes(rating: number, activeCodes: ReadonlySet<DiagnosisCodeId>): string {
  const scoped = ALL_DIAGNOSIS_CODES.filter(
    (entry) => activeCodes.has(entry.id) && rating >= entry.ratingPrior[0] && rating <= entry.ratingPrior[1]
  );
  if (scoped.length === 0) return SCOPED_DIAGNOSIS_CODES_EMPTY_FALLBACK;
  return scoped.map((entry) => `${entry.id} — ${entry.label}`).join('\n');
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Coarse relative-date phrasing for prompt text (not UI-precise). */
export function relativeDate(date: Date, now: Date): string {
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `diagnosisCode` is Task 57.3's code-level target — nullable for legacy
 * category-only rows. Rendered so `propose_focus_area_update` has something
 * to address: since selection is now programmatic, the code is the only
 * stable handle the LLM can reference in a later progress/regress/resolve
 * call. */
export interface FocusAreaSummary {
  category: MistakeCategory;
  diagnosisCode: DiagnosisCodeId | null;
  status: 'active' | 'improving' | 'resolved';
  note: string;
  evidenceCount: number;
  lastSeenAt: Date;
}

/** Format: `- [status] category (CODE): note (seen Nx, last {date})`, or
 * without the code for a legacy category-only row. Injected into
 * coach-system.ts's yourStudent and analysis-planner.ts's user message. */
export function renderFocusAreasBlock(focusAreas: FocusAreaSummary[], now: Date): string {
  if (focusAreas.length === 0) return FOCUS_AREAS_EMPTY_FALLBACK;
  return focusAreas
    .map((area) => {
      const label = area.diagnosisCode ? `${area.category} (${area.diagnosisCode})` : area.category;
      return `- [${area.status}] ${label}: ${area.note} (seen ${area.evidenceCount}x, last ${relativeDate(area.lastSeenAt, now)})`;
    })
    .join('\n');
}

export interface RecentFinding {
  category: MistakeCategory;
  description: string;
  isPositive: boolean;
  createdAt: Date;
}

/** Format: `- [+/-] category: description ({relative date})`. Injected into
 * coach-system.ts's yourStudent and analysis-planner.ts's user message. */
export function renderRecentFindingsBlock(findings: RecentFinding[], now: Date): string {
  if (findings.length === 0) return RECENT_FINDINGS_EMPTY_FALLBACK;
  return findings
    .map(
      (finding) =>
        `- [${finding.isPositive ? '+' : '-'}] ${finding.category}: ${finding.description} (${relativeDate(finding.createdAt, now)})`
    )
    .join('\n');
}

/** Standard chess move-pair phrasing for any ply — "the game start" for
 * ply 0, otherwise "White's/Black's move N". Shared by the coaching-plan
 * renderer and the coach context restructure's annotated-PGN/other-moves-
 * summary/current-move-block renderers (packages/prompts/src/episode-
 * context.ts) so they all describe a ply identically. */
export function describeMoveRef(ply: number): string {
  const ref = plyToMoveRef(ply);
  return ref.color === null ? 'the game start' : `${capitalize(ref.color)}'s move ${ref.moveNumber}`;
}

/**
 * Renders coach-system.ts's "pre-session preparation notes" block: numbered
 * moments with a move-pair reference, kind, diagnosis (whatHappened),
 * question, and key line. Uses "White's/Black's
 * move N" (standard PGN terminology) rather than a bare ply — the model
 * must later address this same moment via show_position's {moveNumber,
 * color}, so the reference it reads here has to be the one it can hand
 * back unchanged, not one it has to convert. whatHappened is included so
 * the coach walks in already knowing the diagnosis instead of having to
 * re-derive "what was wrong" live before it can decide whether there's a
 * genuine question worth asking.
 */
export function renderCoachingPlanBlock(plan: CoachingPlan): string {
  return plan.moments.map((moment, index) => `${index + 1}. ${renderMoment(moment)}`).join('\n');
}

function renderMoment(moment: CoachingPlan['moments'][number]): string {
  return `${describeMoveRef(moment.ply)} (${moment.kind}): ${moment.whatHappened} "${moment.socraticQuestion}" Key line: ${moment.keyLine}`;
}

/** Coach context restructure design §5, layer 5: the backstage conversation
 * ledger, finally rendered into the live prompt (previously computed but
 * never injected). */
export function renderThreadsBlock(threads: Thread[]): string {
  if (threads.length === 0) return '(empty — no parked topics right now)';
  return threads.map(renderThreadLine).join('\n');
}

function renderThreadLine(thread: Thread): string {
  const hypothesis = thread.hypothesis ? ` (hypothesis: ${thread.hypothesis})` : '';
  return `- [${thread.status}] ${thread.topic}${hypothesis}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Derived, not hand-maintained: cuts a tool's full description (tools.ts's
 * COACH_TOOL_SPECS — the same text sent verbatim as that tool's own
 * function-calling schema description) down to its first clause, for the
 * terser local-model tool index (coach-system.ts's yourToolsAndWhenToUseThem).
 * Splitting at the first em dash or period keeps this a pure function of the
 * one description every tool already has — a second, hand-written short
 * blurb per tool would just be a new place for the two to drift apart, which
 * is the exact bug COACH_TOOL_SPECS's own doc comment says it was created to
 * end. Every description in that file opens with a self-contained clause
 * naming what the tool does, so the cut point is always sensible even
 * though this function knows nothing about chess. */
export function briefToolCue(description: string): string {
  const emDash = description.indexOf(' — ');
  const period = description.indexOf('. ');
  const candidates = [emDash, period].filter((index) => index !== -1);
  const cut = candidates.length > 0 ? Math.min(...candidates) : description.length;
  return `${description.slice(0, cut).replace(/[.,;:]$/, '')}.`;
}
