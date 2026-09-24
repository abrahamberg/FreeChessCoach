import { gapOf, narrowTo, valueOf, type EvalPair } from './eval-pair.js';
import type { VerdictContext } from './context.js';
import { mateSide, type LineValue } from './line-value.js';
import { REASON_ORDER, type VerdictReason } from './types.js';

/**
 * 1 = a mate or material reason, 2 = a positional one (develops, tempo, a
 * bind): a tier-2 reason is the verdict only when no tier-1 reason is
 * confirmed on the move, whatever its eval value.
 */
export type ReasonTier = 1 | 2;

/** A reason still in the running, with the most it could explain. */
export interface Candidate {
  reason: VerdictReason;
  ceiling: EvalPair;
  /** `ceiling` in mover-perspective cp — what the early exit compares. */
  ceilingCp: number;
  /** The tier the reason can reach, from its line: a missed or found tactic
   * whose line wins no material and mates nothing can only be positional. */
  tier: ReasonTier;
}

/**
 * Step 2: every reason's ceiling, from the stored evals and the material the
 * stored lines can move — no detector runs here. R is unknown until the
 * materiality witness runs, so each ceiling takes R at its most generous
 * (R ≤ P for a miss, R = B for an allowed tactic, R = the lowest line for a
 * find). A ceiling that isn't meaningful drops its reason unchecked.
 * Returned tier 1 first, then strongest first; equal ceilings keep
 * `REASON_ORDER`.
 */
export function ceilingsOf(ctx: VerdictContext): Candidate[] {
  const pairs = ctx.frame.branch === 'failure' ? failureCeilings(ctx) : creditCeilings(ctx);
  const { mover } = ctx.frame;
  return pairs
    .filter((entry): entry is RawCeiling & { ceiling: EvalPair } => entry.ceiling !== null)
    .filter((entry) => gapOf(entry.ceiling, mover).meaningful)
    .map((entry) => ({ reason: entry.reason, ceiling: entry.ceiling, ceilingCp: valueOf(entry.ceiling, mover), tier: entry.tier ?? 1 }))
    .sort(
      (a, b) => a.tier - b.tier || b.ceilingCp - a.ceilingCp || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
    );
}

interface RawCeiling {
  reason: VerdictReason;
  ceiling: EvalPair | null;
  tier?: ReasonTier;
}

/** A line that wins nothing and mates nothing can only carry a positional
 * motif. */
function lineTier(line: LineValue): ReasonTier {
  return line.mateFor || line.gainedPawns > 0 ? 1 : 2;
}

function failureCeilings(ctx: VerdictContext): RawCeiling[] {
  const { best, played, mover, bestLine, afterLine } = ctx.frame;
  const full: EvalPair = { higherCpWhite: best, lowerCpWhite: played };
  const opponent = mover === 'white' ? 'black' : 'white';
  const bestMates = mateSide(bestLine);
  const afterMates = mateSide(afterLine);
  const lossCap = lossCapCp(ctx.playedWalk.get());
  const bestWalk = ctx.bestWalk.get();

  return [
    { reason: 'missedMate', ceiling: bestMates === mover && afterMates !== mover ? full : null },
    { reason: 'allowedMate', ceiling: afterMates === opponent && bestMates !== opponent ? full : null },
    { reason: 'missedTactic', ceiling: narrowTo(full, gainCapCp(bestWalk), mover), tier: lineTier(bestWalk) },
    { reason: 'allowedTactic', ceiling: lossCap === null ? null : narrowTo(full, lossCap, mover) }
  ];
}

function creditCeilings(ctx: VerdictContext): RawCeiling[] {
  const { best, second, lowest, mover, bestLine, afterLine, playedMates } = ctx.frame;
  if (second === null) return [];
  const mattered: EvalPair = { higherCpWhite: best, lowerCpWhite: second };
  const keptMate = mateSide(bestLine) === mover && (playedMates || mateSide(afterLine) === mover);
  const toLowest: EvalPair = { higherCpWhite: best, lowerCpWhite: lowest };
  const playedWalk = ctx.playedWalk.get();

  return [
    { reason: 'foundMate', ceiling: keptMate ? mattered : null },
    { reason: 'foundTactic', ceiling: narrowTo(toLowest, gainCapCp(playedWalk), mover), tier: lineTier(playedWalk) },
    // The threat's own claimed gain tightens this once the scan has run.
    { reason: 'defusedThreat', ceiling: ctx.input.preventionScans ? mattered : null }
  ];
}

/**
 * The most a line can win for the mover: everything it captures, or
 * anything at all when it mates. A line that captures nothing can still
 * carry a positional motif (Phase 76's positional rung), which material
 * can't bound, so it is left to the eval.
 */
export function gainCapCp(line: LineValue): number {
  if (line.mateFor || line.gainedPawns <= 0) return Infinity;
  return line.gainedPawns * 100;
}

/**
 * The most a refutation can take: everything it captures, or anything when
 * it mates. `null` when it takes nothing — an allowed tactic has to win
 * material or mate (`tactic-allowed.ts`), so there is nothing to check.
 */
export function lossCapCp(line: LineValue): number | null {
  if (line.mateAgainst) return Infinity;
  return line.lostPawns > 0 ? line.lostPawns * 100 : null;
}
