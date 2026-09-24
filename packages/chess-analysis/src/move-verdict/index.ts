import { buildVerdictContext, type VerdictContext } from './context.js';
import { ceilingsOf, type Candidate, type ReasonTier } from './ceilings.js';
import { DEFAULT_VERDICT_DEPS, type MoveVerdictDeps } from './deps.js';
import { verdictDetail } from './detail.js';
import { valueOf } from './eval-pair.js';
import { frameVerdict } from './gate.js';
import { netPawns } from './line-value.js';
import { checkAllowedMate } from './reasons/allowed-mate.js';
import { checkAllowedTactic } from './reasons/allowed-tactic.js';
import type { ConfirmedReason, ReasonCheck } from './reasons/confirmed.js';
import { checkDefusedThreat } from './reasons/defused-threat.js';
import { checkFoundMate } from './reasons/found-mate.js';
import { checkFoundTactic } from './reasons/found-tactic.js';
import { checkMissedMate } from './reasons/missed-mate.js';
import { checkMissedTactic } from './reasons/missed-tactic.js';
import { REASON_ORDER, type MoveVerdict, type MoveVerdictInput, type VerdictReason } from './types.js';

export * from './types.js';
export { countingVerdictDeps, DEFAULT_VERDICT_DEPS, type MoveVerdictDeps, type VerdictCounters } from './deps.js';
export { walkLineValue, type LineValue } from './line-value.js';
export { verdictDiagnosticCode, type VerdictDiagnosticCode } from './diagnostic-code.js';
export { computeTacticPreventionCounts, type TacticPreventionCounts } from './prevention-counts.js';

const CHECKS: Record<VerdictReason, ReasonCheck> = {
  missedMate: checkMissedMate,
  allowedMate: checkAllowedMate,
  missedTactic: checkMissedTactic,
  allowedTactic: checkAllowedTactic,
  foundMate: checkFoundMate,
  foundTactic: checkFoundTactic,
  defusedThreat: checkDefusedThreat
};

/**
 * One tactical reason per move, or none (`docs/plan.md` Task 77.5):
 * 1. a free gate on the stored evals — `null` here runs no detector;
 * 2. a ceiling per reason, from the stored evals and lines alone;
 * 3. checks mate/material reasons (tier 1) before positional ones (tier 2),
 *    each strongest ceiling first, stopping once a confirmed tier-1 reason
 *    explains at least as much as any reason left could;
 * 4. a confirmed tier-1 reason always beats a tier-2 one; within a tier the
 *    largest confirmed value wins; ties go to |net material| (mate above
 *    all), then mate > tactic > threat.
 *
 * Pure. `deps` exists so a test or the benchmark can see what ran.
 */
export function decideMoveVerdict(input: MoveVerdictInput, deps: MoveVerdictDeps = DEFAULT_VERDICT_DEPS): MoveVerdict | null {
  const frame = frameVerdict(input);
  if (!frame) return null;

  const ctx = buildVerdictContext(input, deps, frame);
  const confirmed = runChecks(ctx, ceilingsOf(ctx));
  return confirmed ? toVerdict(ctx, confirmed) : null;
}

/**
 * Checks tier 1 (mate/material) before tier 2 (positional), each strongest
 * ceiling first. A confirmed tier-1 reason stops the run once it explains
 * at least as much as the next tier-1 ceiling, and always before tier 2: a
 * positional reason is the verdict only when no tier-1 reason confirmed. A
 * tier-2 result never stops a check.
 */
function runChecks(ctx: VerdictContext, candidates: readonly Candidate[]): ConfirmedReason | null {
  const { mover } = ctx.frame;
  const strongest: Record<ReasonTier, ConfirmedReason | null> = { 1: null, 2: null };

  for (const candidate of candidates) {
    const material = strongest[1];
    // Sorted by tier, then strongest first, so nothing left can beat it.
    if (material && (candidate.tier === 2 || valueOf(material.explained, mover) >= candidate.ceilingCp)) break;
    ctx.deps.onCheck(candidate.reason);
    const confirmed = CHECKS[candidate.reason](ctx);
    if (!confirmed) continue;
    const tier = confirmedTier(confirmed);
    const current = strongest[tier];
    if (!current || outranks(confirmed, current, ctx)) strongest[tier] = confirmed;
  }
  return strongest[1] ?? strongest[2];
}

/** A reason's tier is its card's gain: mate or material is tier 1,
 * anything else (positional, tempo, safety) tier 2. A card with no stated
 * gain is judged by its line. */
function confirmedTier({ card, line }: ConfirmedReason): ReasonTier {
  const gain = (card.tacticOpportunity ?? card.tacticAllowed ?? card.tacticPrevention)?.gain;
  if (!gain) return line.mateFor || line.mateAgainst || netPawns(line) !== 0 ? 1 : 2;
  return gain.kind === 'mate' || gain.kind === 'material' ? 1 : 2;
}

function outranks(a: ConfirmedReason, b: ConfirmedReason, ctx: VerdictContext): boolean {
  const { mover } = ctx.frame;
  const byValue = valueOf(a.explained, mover) - valueOf(b.explained, mover);
  if (byValue !== 0) return byValue > 0;
  const byMaterial = materialWeight(a) - materialWeight(b);
  if (byMaterial !== 0 && !Number.isNaN(byMaterial)) return byMaterial > 0;
  return REASON_ORDER.indexOf(a.reason) < REASON_ORDER.indexOf(b.reason);
}

/** |net material|, with mate above any material. */
function materialWeight({ line }: ConfirmedReason): number {
  return line.mateFor || line.mateAgainst ? Infinity : Math.abs(netPawns(line));
}

function toVerdict(ctx: VerdictContext, confirmed: ConfirmedReason): MoveVerdict {
  const { mover, branch } = ctx.frame;
  const value = valueOf(confirmed.explained, mover);
  const forWhite = (branch === 'credit') === (mover === 'white');
  return {
    kind: branch,
    reason: confirmed.reason,
    explainedCpWhite: forWhite ? value : -value,
    gainedPawns: confirmed.line.gainedPawns,
    lostPawns: confirmed.line.lostPawns,
    card: { ...confirmed.card, detail: verdictDetail(confirmed.reason, confirmed.line) },
    ...(confirmed.threat ? { threat: confirmed.threat } : {})
  };
}
