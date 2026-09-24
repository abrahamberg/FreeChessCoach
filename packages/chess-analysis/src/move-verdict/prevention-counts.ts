import type { ClassifiedMoveDto, TacticMotifType } from '@freechesscoach/shared';
import { BEST_OR_BETTER } from '../game-tactic-motifs.js';
import type { MoveVerdict } from './types.js';

type Colour = 'white' | 'black';

export interface TacticPreventionCounts {
  preventable: Partial<Record<TacticMotifType, number>>;
  prevented: Partial<Record<TacticMotifType, number>>;
}

/**
 * Per-colour "tactics prevented" tally, read off the verdicts
 * (`docs/plan.md` Task 77.5):
 * - prevented = the `defusedThreat` verdicts, by the threat's motif;
 * - preventable = prevented + **every** `allowedTactic` verdict, by the motif
 *   the reply collected — the threats the move left (or put) in play. No
 *   scan checks whether that threat already stood before the move: a tactic
 *   the move created counts as preventable too (it was, by not playing it),
 *   and asking would cost a prevention scan on every failure.
 *
 * **Changed in Task 77.5.** This used to be its own pass
 * (`computeTacticMotifPrevented`): a PV scan of the opponent's threats before
 * and after *every* move, counting every motif that was reachable at all as
 * preventable. Now each move has one reason, the prevention scan runs only
 * where `defusedThreat` is still a candidate, and a standing threat counts
 * only when it is the reason the move was a failure (`allowedTactic`). A
 * threat defused by a move whose bigger reason was something else counts
 * there, not here.
 *
 * `BEST_OR_BETTER` still keeps a best-or-better move out of `preventable`
 * when it left a threat standing — there was no better reply, so nothing
 * was preventable for the player. An `allowedTactic` verdict needs a
 * meaningful eval gap, so that guard now only fires on inconsistent data;
 * a defused threat counts whatever the move's quality, since the credit
 * gate already asks that the move mattered.
 */
export function computeTacticPreventionCounts(
  moves: readonly ClassifiedMoveDto[],
  verdicts: ReadonlyMap<number, MoveVerdict | null>
): Record<Colour, TacticPreventionCounts> {
  const counts: Record<Colour, TacticPreventionCounts> = {
    white: { preventable: {}, prevented: {} },
    black: { preventable: {}, prevented: {} }
  };
  for (const move of moves) {
    const verdict = verdicts.get(move.ply);
    const tally = counts[move.mover];
    if (verdict?.reason === 'defusedThreat' && verdict.card.tacticPrevention) {
      const { type } = verdict.card.tacticPrevention;
      increment(tally.prevented, type);
      increment(tally.preventable, type);
    } else if (verdict?.reason === 'allowedTactic' && verdict.card.tacticAllowed && !BEST_OR_BETTER.has(move.quality)) {
      increment(tally.preventable, verdict.card.tacticAllowed.type);
    }
  }
  return counts;
}

function increment(counts: Partial<Record<TacticMotifType, number>>, type: TacticMotifType): void {
  counts[type] = (counts[type] ?? 0) + 1;
}
