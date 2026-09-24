import type { TacticGainKind } from '@freechesscoach/shared';
import { computeTacticAllowed } from '../../tactic-allowed.js';
import type { VerdictContext } from '../context.js';
import type { EvalPair } from '../eval-pair.js';
import { netPawns, type LineValue } from '../line-value.js';
import type { MoveVerdictCard, ThreatMove, VerdictReason } from '../types.js';

/** What a check returns when it confirms its reason. */
export interface ConfirmedReason {
  reason: VerdictReason;
  /** The part of the eval this reason explains; never wider than its
   * ceiling. */
  explained: EvalPair;
  /** The line the reason was walked on (step 4). */
  line: LineValue;
  card: Omit<MoveVerdictCard, 'detail'>;
  threat?: ThreatMove;
}

export type ReasonCheck = (ctx: VerdictContext) => ConfirmedReason | null;

/**
 * Step 4's consistency rule: the net material points the way the eval gap
 * does. A gain needs net ≥ +1 or mate for; a loss needs net ≤ −1 or mate
 * against. A `positional` motif (Phase 76's positional rung) needs no
 * material, only the eval.
 */
export function materialAgrees(line: LineValue, story: 'gain' | 'loss', gainKind: TacticGainKind | undefined): boolean {
  if (gainKind === 'positional') return true;
  if (story === 'gain') return line.mateFor || netPawns(line) >= 1;
  return line.mateAgainst || netPawns(line) <= -1;
}

/** The allowed card exactly as `computeTacticAllowed` reads it: the reply's
 * pre-gate chance, material or mate only. */
export function allowedCardOf(ctx: VerdictContext): MoveVerdictCard['tacticAllowed'] {
  const { move, next } = ctx.input;
  const chance = ctx.nextChance.get();
  if (!next || !chance) return undefined;
  return computeTacticAllowed(move, { ...next, tacticOpportunity: chance });
}

const MATE_GAIN = { kind: 'mate', pawns: 0, prize: null } as const;

/** A mate the engine sees but no detector names on its first move. */
export function mateOpportunityCard(
  embodiedBySan: string,
  found: boolean
): NonNullable<MoveVerdictCard['tacticOpportunity']> {
  return { type: 'checkmate', found, detail: null, visual: null, gain: { ...MATE_GAIN }, embodiedBySan };
}

export function mateAllowedCard(byMoveSan: string | undefined): NonNullable<MoveVerdictCard['tacticAllowed']> {
  return { type: 'checkmate', detail: null, visual: null, gain: { ...MATE_GAIN }, ...(byMoveSan ? { byMoveSan } : {}) };
}
