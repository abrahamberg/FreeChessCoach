import { DIAGNOSIS_CODES_BY_ID, type DiagnosisCodeId, type Direction } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { isHumanReachable } from './reachability.js';
import type { DiagnosticProfileEntry, ControlSkill } from './build-profile.js';
import type { FiredGate } from './evaluate-gates.js';

/** One profile entry plus the data-quality gates that fired *for this same
 * code* — `evaluateGates` is called per code (its `opportunities`/
 * `meanReachability`/etc. are the code's own), so the caller joins the two
 * pure modules' outputs before calling `selectFocus`, same free-standing-
 * primitive pattern as `build-profile.ts` joining `beta-binomial.ts`. */
export interface FocusCandidate {
  profile: DiagnosticProfileEntry;
  firedGates: readonly FiredGate[];
}

export interface SelectFocusInput {
  candidates: readonly FocusCandidate[];
}

export interface Differential {
  code: DiagnosisCodeId;
  direction: Direction;
  reason: string;
}

export interface FocusSelection {
  primary: DiagnosticProfileEntry | null;
  secondary: DiagnosticProfileEntry[];
  /** Mirrors `primary.controlSkill` — surfaced at the top level since §IV's
   * "normally return" list names it as its own item, not merely a field
   * nested inside the primary finding. `null` whenever there is no primary. */
  controlSkill: ControlSkill | null;
  differentials: Differential[];
}

function candidateKey(profile: DiagnosticProfileEntry): string {
  return `${profile.code}:${profile.direction}`;
}

/**
 * §I.3's own causal-precedence chain — "Rules → board model → board update
 * → scan/process → recognition → candidate generation → calculation →
 * judgment → state" — restricted to the five families that chain actually
 * names (`RB`/`BV`/`MS`/`TA`/`CA`; §I.3's own examples are all BV vs TA).
 * Deliberately narrower than `resolve-episodes.ts`'s `familyRank` (which
 * orders all 18 families to break ties *within one already-linked
 * incident*): unrelated content domains like `EG` vs `PW` have no causal
 * relationship to filter on here, so they're left out of this chain
 * entirely rather than reusing an arbitrary total order across the whole
 * catalog.
 */
const MECHANISM_CHAIN_FAMILIES = ['RB', 'BV', 'MS', 'TA', 'CA'] as const;

function chainRank(code: DiagnosisCodeId): number | null {
  const family = code.slice(0, 2);
  const index = MECHANISM_CHAIN_FAMILIES.indexOf(family as (typeof MECHANISM_CHAIN_FAMILIES)[number]);
  return index === -1 ? null : index;
}

/**
 * §IV's objective — confidence × preventable impact × recurrence × transfer
 * breadth × trainability × measurement feasibility — read against fields
 * `build-profile.ts` (Task 55.3) already computes, so nothing here re-derives
 * evidence the profile builder already owns:
 *
 * - confidence: `CONFIG.selectFocus.confidenceWeight` reads §4.6's tier
 *   directly (`'insufficient'` scores 0, which alone keeps an
 *   under-evidenced code from ever outscoring a real candidate).
 * - preventable impact: mean hWDL per failed episode (`totalHwdl /
 *   episodes` — hWDL is already "preventable expected-score loss" per its
 *   own doc comment) times `meanReachability` (how findable the fix was),
 *   so impact that wasn't actually preventable at the student's level
 *   scores low without a second invented weight.
 * - recurrence: episodes saturating at `recurrenceSaturation`.
 * - transfer breadth: `'general'` scope reads as full breadth; any bound
 *   scope tag reads as `transferBreadthBoundWeight` — reusing
 *   `detectScopeTags`' own output rather than re-deriving breadth from
 *   `spread`.
 * - trainability: an intact control skill demonstrates the underlying
 *   capacity already exists (§VI requires one in every finding for exactly
 *   this reason), so its presence reads as full trainability.
 * - measurement feasibility: opportunities saturating at
 *   `measurementFeasibilitySaturation` — how much more evidence this code
 *   can still accumulate going forward.
 *
 * `improvingPriorityMultiplier` applies §IV's "reduce priority when...
 * already improving" bullet. The rest of that "reduce priority" list is
 * already structurally satisfied by the hard filters below: an eligible
 * candidate can never be evidence from one accidental game (the confidence
 * gate itself requires `gamesSpread >= confidenceSignalMinGames`), rare
 * opportunities and rating-prior-only evidence are already suppressed by
 * `recurrence`/`measurementFeasibility` saturating near 0, and unrealistic
 * alternatives/absent prerequisites/downstream consequences/low transfer
 * are the prerequisite, root-cause, and transfer-breadth terms above.
 */
function scoreOf(profile: DiagnosticProfileEntry): number {
  const c = CONFIG.selectFocus;

  const confidenceScore = c.confidenceWeight[profile.confidence];
  const preventableImpact = profile.episodes === 0 ? 0 : profile.meanReachability * (profile.totalHwdl / profile.episodes);
  const recurrence = Math.min(1, profile.episodes / c.recurrenceSaturation);
  const transferBreadth = profile.scopeTags.includes('general') ? 1 : c.transferBreadthBoundWeight;
  const trainability = profile.controlSkill ? 1 : c.trainabilityWithoutControlWeight;
  const measurementFeasibility = Math.min(1, profile.opportunities / c.measurementFeasibilitySaturation);
  const priorityMultiplier = profile.historyStatus === 'improving' ? c.improvingPriorityMultiplier : 1;

  return confidenceScore * preventableImpact * recurrence * transferBreadth * trainability * measurementFeasibility * priorityMultiplier;
}

/**
 * §IV's seven overrides, applied as hard filters against the candidate
 * pool (never as score weights, per the task's own instruction) before any
 * scoring happens. Returns the surviving candidates plus a reason string
 * for every one it removed, so a caller can report *why* a code became a
 * ruled-out differential rather than just that it did.
 *
 * Override 4 (scope: "the target must fit a focused cycle") has nothing to
 * filter here — every `FocusCandidate` is already one atomic code+direction
 * skill from the §II catalog (Task 52.2's 410-code table), which is this
 * codebase's own operational definition of "fits a focused cycle." It has
 * no implementation below because there is no composite/multi-code target
 * for it to narrow.
 */
function applyOverrides(candidates: readonly FocusCandidate[]): { eligible: FocusCandidate[]; reasons: Map<string, string> } {
  const reasons = new Map<string, string>();
  const exclude = (candidate: FocusCandidate, reason: string): void => {
    reasons.set(candidateKey(candidate.profile), reason);
  };

  // Override 5 — data-quality: every §II.A gate is blocking (see
  // `data-quality.ts`'s own doc comment), so any fired gate disqualifies
  // this code from ever being primary, unconditionally.
  let pool = candidates.filter((candidate) => {
    if (candidate.firedGates.length === 0) return true;
    exclude(candidate, `blocked by data-quality gate(s): ${candidate.firedGates.map((gate) => gate.code).join(', ')}`);
    return false;
  });

  // Not one of §IV's seven named overrides, but a precondition for all of
  // them: §4.6 confidence tiers gate whether a code counts as evidence at
  // all ("the system must be allowed to return Insufficient evidence").
  pool = pool.filter((candidate) => {
    if (candidate.profile.confidence !== 'insufficient') return true;
    exclude(candidate, 'insufficient confidence — not enough independent evidence yet');
    return false;
  });

  // Override 3 — human-reachability: ignore engine-only improvements.
  pool = pool.filter((candidate) => {
    if (isHumanReachable(candidate.profile.meanReachability)) return true;
    exclude(candidate, `not human-reachable at this rating (mean reachability ${candidate.profile.meanReachability.toFixed(2)})`);
    return false;
  });

  // Overrides 1+2 — prerequisite + root-cause: both reduce to "test the
  // more upstream cause first" per §I.3, so one pass covers both (same
  // reasoning `evaluate-gates.ts` used to merge DQ-03/DQ-15).
  pool = pool.filter((candidate) => {
    const rank = chainRank(candidate.profile.code);
    if (rank === null) return true;
    const upstream = pool.find((other) => other !== candidate && (chainRank(other.profile.code) ?? Infinity) < rank);
    if (!upstream) return true;
    exclude(
      candidate,
      `explained by the more upstream ${upstream.profile.code}.${upstream.profile.direction} (§I.3 causal precedence)`
    );
    return false;
  });

  // Override 6 — state: if a performance-state finding (`PS-*`,
  // §I.2's "S" mechanism) already has signal, a clock/stress-tagged
  // chess-concept code alongside it is more likely the same state incident
  // mislabeled as a concept gap than an independent weakness.
  const stateCandidate = pool.find((candidate) => candidate.profile.code.startsWith('PS-'));
  if (stateCandidate) {
    pool = pool.filter((candidate) => {
      if (candidate === stateCandidate) return true;
      const stateExplained = candidate.profile.scopeTags.includes('clock_bound') || candidate.profile.scopeTags.includes('stress_sensitive');
      if (!stateExplained) return true;
      exclude(
        candidate,
        `concentrated under clock/stress state already explained by ${stateCandidate.profile.code}.${stateCandidate.profile.direction} (§IV state override)`
      );
      return false;
    });
  }

  // Override 7 — curriculum-value: rare theoretical knowledge shouldn't
  // displace a frequent game leak. `evidenceTrack` (Task 52.2) already
  // distinguishes the two directly, so no new heuristic is needed.
  const bestGameLeakEpisodes = Math.max(
    0,
    ...pool
      .filter((candidate) => DIAGNOSIS_CODES_BY_ID.get(candidate.profile.code)?.evidenceTrack === 'game_leak')
      .map((candidate) => candidate.profile.episodes)
  );
  pool = pool.filter((candidate) => {
    const track = DIAGNOSIS_CODES_BY_ID.get(candidate.profile.code)?.evidenceTrack;
    if (track !== 'curriculum_only_gap') return true;
    if (bestGameLeakEpisodes <= candidate.profile.episodes) return true;
    exclude(candidate, 'curriculum-only content outranked by a more frequent game leak (§IV curriculum-value override)');
    return false;
  });

  return { eligible: pool, reasons };
}

/**
 * §IV — chooses the next 1-2 week focus from a window's diagnostic profile
 * (Task 55.3's `DiagnosticProfileEntry[]`, one code+direction per entry,
 * joined here with each code's own fired data-quality gates). Pure
 * selection over already-computed evidence: no DB/engine access, same
 * free-standing-primitive pattern as every other Phase 54/55 module.
 */
export function selectFocus(input: SelectFocusInput): FocusSelection {
  const { eligible, reasons } = applyOverrides(input.candidates);

  const ranked = eligible.map((candidate) => ({ candidate, score: scoreOf(candidate.profile) })).sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.candidate.profile ?? null;
  const secondary = ranked.slice(1, 3).map((entry) => entry.candidate.profile);

  for (const entry of ranked.slice(3)) {
    reasons.set(candidateKey(entry.candidate.profile), 'lower priority score than the selected findings');
  }

  const selectedKeys = new Set([primary, ...secondary].filter((profile): profile is DiagnosticProfileEntry => profile !== null).map(candidateKey));

  const differentials: Differential[] = input.candidates
    .filter((candidate) => !selectedKeys.has(candidateKey(candidate.profile)))
    .map((candidate) => ({
      code: candidate.profile.code,
      direction: candidate.profile.direction,
      reason: reasons.get(candidateKey(candidate.profile)) ?? 'not selected'
    }));

  return {
    primary,
    secondary,
    controlSkill: primary?.controlSkill ?? null,
    differentials
  };
}
