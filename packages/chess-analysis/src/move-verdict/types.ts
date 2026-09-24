import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import type { AvailableMotifScan } from '../available-motifs-scan.js';
import type { PreviousMove } from '../tactic-detectors/context.js';

export type VerdictKind = 'failure' | 'credit';

export const FAILURE_REASONS = ['missedMate', 'allowedMate', 'missedTactic', 'allowedTactic'] as const;
export const CREDIT_REASONS = ['foundMate', 'foundTactic', 'defusedThreat'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];
export type CreditReason = (typeof CREDIT_REASONS)[number];
export type VerdictReason = FailureReason | CreditReason;

/**
 * The fixed tie order: mate > tactic > threat, missed before allowed before
 * found. Also the order checks with equal ceilings run in.
 */
export const REASON_ORDER: readonly VerdictReason[] = [
  'missedMate',
  'allowedMate',
  'foundMate',
  'missedTactic',
  'allowedTactic',
  'foundTactic',
  'defusedThreat'
];

/** The data each existing card needs; the wiring sets at most one of them. */
export interface MoveVerdictCard {
  tacticOpportunity?: NonNullable<ClassifiedMoveDto['tacticOpportunity']>;
  tacticAllowed?: NonNullable<ClassifiedMoveDto['tacticAllowed']>;
  tacticPrevention?: NonNullable<ClassifiedMoveDto['tacticPrevention']>;
  /** The smaller material events on the same line, e.g. "won a knight, but
   * it cost the queen". `null` when there were none. */
  detail: string | null;
}

export interface MoveVerdict {
  kind: VerdictKind;
  reason: VerdictReason;
  /** How much of the eval this reason explains, White-perspective and
   * signed: negative when it went against White (a White failure or a Black
   * credit), on the shared clamped cp scale. */
  explainedCpWhite: number;
  gainedPawns: number;
  lostPawns: number;
  card: MoveVerdictCard;
  /** `defusedThreat` only: the threat's own move and the position it was
   * seen from, so its diagnostic code can replay it like an allowed one. */
  threat?: ThreatMove;
}

export interface ThreatMove {
  fenBefore: string;
  moveSan: string;
}

/** The two realistic threat scans the prevention path compares — the
 * opponent's threats at `prior.fenBefore` and at `move.fenAfter`, each as
 * `scanRealisticThreats` returns them. */
export interface PreventionScans {
  before: AvailableMotifScan;
  after: AvailableMotifScan;
}

export interface MoveVerdictInput {
  move: ClassifiedMoveDto;
  /** `evals[move.ply - 1]` is the position before the move, `evals[move.ply]`
   * the one after it. */
  evals: EngineEval[];
  /** The opponent's move before this one, for the recapture gate. */
  previous: PreviousMove | null;
  /** The opponent's reply, when there is one: what an `allowed*` reason is
   * read off. */
  next?: ClassifiedMoveDto;
  /** Called only when `defusedThreat` is actually checked. `null` when the
   * scans can't be built (first move, missing evals). */
  preventionScans?: () => PreventionScans | null;
}
