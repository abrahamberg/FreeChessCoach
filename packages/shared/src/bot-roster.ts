import type { DiagnosisCodeId } from './diagnosis/catalog-types.js';
import { interpolateAnchors } from './interpolate.js';

/**
 * Every diagnosis code a bot's own move selection can actually be steered
 * toward manifesting — the union of `MOTIF_RESOLVABLE_DIAGNOSIS_CODES`
 * (`packages/chess-analysis/src/diagnostics/motif-to-code.ts`, `TA-*`) and
 * `CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES`
 * (`packages/chess-analysis/src/diagnostics/candidate-diagnosis-proxy.ts`,
 * `BV-01`/`BV-02`/`MS-02`/`MS-03`) — the only two sources `bot-candidates.ts`
 * populates a `BotCandidate.diagnosisCodes` from, which is in turn the only
 * thing `pickBotMove`'s steering roll (docs/plan.md Phase 62) ever checks a
 * bot's own `diagnosisCodes` against. This literal list, not an import,
 * because `packages/shared` cannot depend on `packages/chess-analysis`
 * (AGENTS.md's layering — chess-analysis depends on shared, not the other
 * way around); `packages/chess-analysis/src/bot-roster-diagnosis-codes.test.ts`
 * (which, unlike this file, can import both sides) asserts this stays in
 * sync with both source lists so it can't silently drift. A code
 * outside this set would be inert flavor text: real (Task 62.4's detector
 * pass) but never something the bot's own selection can be nudged toward,
 * exactly the claim Phase 61 refused to make for the other 391 codes in the
 * 410-code catalog — see `documentedDiagnosisCodes` below for why that
 * boundary hasn't otherwise moved.
 */
export const ELIGIBLE_DIAGNOSIS_CODES: readonly DiagnosisCodeId[] = [
  'TA-01',
  'TA-04',
  'TA-07',
  'TA-08',
  'TA-09',
  'TA-10',
  'TA-11',
  'TA-12',
  'TA-14',
  'TA-16',
  'TA-17',
  'TA-18',
  'TA-19',
  'TA-26',
  'TA-43',
  'BV-01',
  'BV-02',
  'MS-02',
  'MS-03'
];

/**
 * Elo -> target `diagnosisCodes` breadth, per the user's own worked
 * examples (docs/plan.md Phase 62): 300 documents the full eligible pool
 * ("all diagnose"), tapering to 0 by the roster's elo ceiling. Piecewise
 * linear between anchors (a plain count, not a probability, so there's no
 * 0/1-asymptote reason to interpolate in logit space the way
 * bot-skill-curve.ts's chance curves do), rounded to the nearest whole
 * code and clamped to `[0, ELIGIBLE_DIAGNOSIS_CODES.length]`. Bracket-
 * finding/clamping itself is `interpolateAnchors` (packages/shared) —
 * shared with `bot-skill-curve.ts`'s (packages/chess-analysis)
 * `interpolateChance`, which needs the same "find the bracket, clamp
 * outside it" shape but blends in logit space rather than plain linear.
 */
const DIAGNOSIS_BREADTH_ANCHORS: ReadonlyArray<readonly [elo: number, breadth: number]> = [
  [300, 19],
  [400, 14],
  [600, 9],
  [800, 6],
  [1200, 3],
  [1500, 2],
  [2300, 0]
];

function diagnosisCodeBreadthForElo(elo: number): number {
  return Math.round(
    interpolateAnchors(DIAGNOSIS_BREADTH_ANCHORS, elo, (breadthLower, breadthUpper, t) => breadthLower + t * (breadthUpper - breadthLower))
  );
}

/**
 * Elo -> how many of a position's own known book continuations
 * (`bookMovesForFen`, packages/chess-analysis) a bot is even allowed to
 * consider before its random pick — narrow theory for a beginner (300-600
 * only ever sees the book's first 2 entries for a position, however many
 * theory actually documents), widening toward the roster's ceiling. The top
 * anchor (20) is the bundled opening book's own real max
 * entries-per-position (`packages/chess-analysis/src/generated/
 * opening-book-index.json`, confirmed by inspection, not guessed) — so the
 * top tier's cap is a no-op, it simply never has more than the book itself
 * offers. `selectBookMove` (bot-opening.ts) truncates to this count, taking
 * the book's own first N entries — there's no popularity/frequency data in
 * the source to rank by instead.
 */
const BOOK_BREADTH_ANCHORS: ReadonlyArray<readonly [elo: number, breadth: number]> = [
  [300, 2],
  [800, 4],
  [1500, 6],
  [2300, 20]
];

export function bookBreadthForElo(elo: number): number {
  return Math.round(
    interpolateAnchors(BOOK_BREADTH_ANCHORS, elo, (breadthLower, breadthUpper, t) => breadthLower + t * (breadthUpper - breadthLower))
  );
}

/**
 * `signature` is this bot's own hand-picked, narratively-justified codes
 * (a defensible read of its `description`/`personality`, per Phase 61's
 * original convention — trailing comments on the roster entries below
 * explain the less-obvious ones). The elo-scaled breadth
 * (`diagnosisCodeBreadthForElo`) is filled in *on top of* those, in
 * `ELIGIBLE_DIAGNOSIS_CODES`'s fixed order, when the tier calls for more
 * than the signature alone provides — deliberately not individually
 * narrated: a beginner-tier bot documented with close to all 19 eligible
 * codes is a statement about how indiscriminately a real beginner exhibits
 * these problems, not 19 separate claims each needing its own bio-derived
 * justification. Never drops a signature code even when the elo-scaled
 * breadth alone would call for fewer — a bot's own defensible weaknesses
 * are never diluted by leveling up faster than they'd suggest. Trailing
 * comments on the individual roster entries (`bot-roster-presets.ts`)
 * explain the less-obvious signature picks.
 *
 * Exported for `bot-roster-presets.ts` (the roster's own literal data,
 * split out purely to keep this file — the roster's *logic* — under the
 * usual line-count target; see AGENTS.md's "one responsibility per file").
 */
export function documentedDiagnosisCodes(signature: readonly DiagnosisCodeId[], elo: number): DiagnosisCodeId[] {
  const breadth = Math.max(diagnosisCodeBreadthForElo(elo), signature.length);
  const codes = [...signature];
  for (const code of ELIGIBLE_DIAGNOSIS_CODES) {
    if (codes.length >= breadth) break;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}
