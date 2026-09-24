import { classifyTacticChance } from '../game-tactic-motifs.js';
import { combineThreatOutcome } from '../tactic-prevention-check.js';
import { firstLineWithOtherHeadline } from '../tactic-opportunity-witness.js';
import { walkLineValue } from './line-value.js';
import { REASON_ORDER, type VerdictReason } from './types.js';

/**
 * Everything `decideMoveVerdict` calls that costs something, as one object
 * so a test or the benchmark can wrap it and see what ran. The defaults are
 * the shipped functions, unchanged.
 */
export interface MoveVerdictDeps {
  /** The detector-registry run behind every missed/found/allowed card. */
  classifyTacticChance: typeof classifyTacticChance;
  /** The materiality witness: finds line R. */
  firstLineWithOtherHeadline: typeof firstLineWithOtherHeadline;
  walkLineValue: typeof walkLineValue;
  combineThreatOutcome: typeof combineThreatOutcome;
  /** Called once per reason actually checked, in check order. */
  onCheck: (reason: VerdictReason) => void;
}

export const DEFAULT_VERDICT_DEPS: MoveVerdictDeps = {
  classifyTacticChance,
  firstLineWithOtherHeadline,
  walkLineValue,
  combineThreatOutcome,
  onCheck: () => undefined
};

export interface VerdictCounters {
  checks: Record<VerdictReason, number>;
  tacticChances: number;
  referenceLines: number;
  threatOutcomes: number;
}

/** `base` wrapped with counters — how the benchmark measures what the early
 * exit saved. The counters object is live: read it after the run. */
export function countingVerdictDeps(base: MoveVerdictDeps = DEFAULT_VERDICT_DEPS): {
  deps: MoveVerdictDeps;
  counters: VerdictCounters;
} {
  const counters: VerdictCounters = {
    checks: Object.fromEntries(REASON_ORDER.map((reason) => [reason, 0])) as Record<VerdictReason, number>,
    tacticChances: 0,
    referenceLines: 0,
    threatOutcomes: 0
  };
  const deps: MoveVerdictDeps = {
    ...base,
    classifyTacticChance: (...args) => {
      counters.tacticChances += 1;
      return base.classifyTacticChance(...args);
    },
    firstLineWithOtherHeadline: (...args) => {
      counters.referenceLines += 1;
      return base.firstLineWithOtherHeadline(...args);
    },
    combineThreatOutcome: (...args) => {
      counters.threatOutcomes += 1;
      return base.combineThreatOutcome(...args);
    },
    onCheck: (reason) => {
      counters.checks[reason] += 1;
      base.onCheck(reason);
    }
  };
  return { deps, counters };
}
