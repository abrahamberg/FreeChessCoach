import { DIAGNOSTIC_DETECTORS, plyToMoveRef } from '@freechesscoach/chess-analysis';
import { ALL_DIAGNOSIS_CODES, MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import type { CoachingPlan, DiagnosisCodeId, MistakeCategory, Thread } from '@freechesscoach/shared';

export const MISTAKE_CATEGORIES_BLOCK = MISTAKE_CATEGORIES.join(', ');

const FOCUS_AREAS_EMPTY_FALLBACK = '(none yet — this is early in your work together)';
const RECENT_FINDINGS_EMPTY_FALLBACK = '(none yet — no findings recorded so far)';
const SCOPED_DIAGNOSIS_CODES_EMPTY_FALLBACK =
  '(no catalog codes are scoped to this student yet — leave diagnosisCode unset and use the category list above instead)';

/** Every code with a real detector (Task 53+) — the only way
 * `renderScopedDiagnosisCodes` grounds a code. Computed once, not per call —
 * `DIAGNOSTIC_DETECTORS` is a fixed module-level registry, not per-request
 * data. */
export const ACTIVE_DETECTOR_CODES: ReadonlySet<DiagnosisCodeId> = new Set(
  DIAGNOSTIC_DETECTORS.map((detector) => detector.code)
);

/**
 * docs/diagnose.md §0.1: a code's `ratingPrior` is the interval where it's
 * "most likely to be a primary, high-value coaching diagnosis," not an
 * exclusive cutoff — this filters to that operational window rather than
 * trying to model the wider penumbra the spec describes in prose.
 * Restricted to `activeDetectorCodes` (never `detectability: 'dialogue'`,
 * `'probe'` or `'unsupported'`): most of the 410-code catalog is still
 * `'dialogue'` by design (docs/diagnose.md's "extensible operational
 * glossary" — undetected codes the coach reasons about in conversation, the
 * same way `record_finding`'s tool description already guides it, with no
 * catalog list at all). Measured at rating 900-1500 the dialogue-inclusive
 * version of this filter matches 300+ of 410 codes — exactly what "never
 * inject all 410 codes" rules out — so only the ~30 detector-backed codes
 * (the ones `get_diagnostic_profile` can actually put real evidence behind)
 * are worth spending prompt-cache/token budget to name explicitly. Pure and
 * rating-only so a caller can place it in whichever cache tier (static per
 * rating band, or dynamic per numeric rating) actually matches how it's
 * computing `rating`.
 */
export function renderScopedDiagnosisCodes(rating: number, activeDetectorCodes: ReadonlySet<DiagnosisCodeId>): string {
  const scoped = ALL_DIAGNOSIS_CODES.filter(
    (entry) =>
      entry.detectability === 'detector' &&
      activeDetectorCodes.has(entry.id) &&
      rating >= entry.ratingPrior[0] &&
      rating <= entry.ratingPrior[1]
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
