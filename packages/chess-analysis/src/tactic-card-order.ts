import { isImprovableQuality, type MoveQuality, type TacticGainDto } from '@freechesscoach/shared';
import { GAIN_KIND_WEIGHT } from './rank-tactic-claims.js';

/**
 * Which of Game Review's two tactic sentences leads the card.
 *
 * `rank-tactic-claims.ts` decides which motif leads *within* one card; this
 * decides which card leads, and the two were never the same question. The
 * shipped order was positional — prevention first because
 * `attachTacticPrevention` happened to append its sentence before
 * `build-game-report.ts` appended the opportunity's — so a blunder that
 * threw away a queen opened with the consolation prize:
 *
 *     You stopped them winning a bishop through a discovered attack.
 *     You missed a chance to win a queen through a trapped piece two moves away.
 *
 * The reader has one lesson on that move and it is the queen. Two rules put
 * it first, in this order:
 *
 * 1. **A move that cost evaluation is read for what it missed.** Whatever
 *    good the move also did, it is not why the move is on screen — so on an
 *    inaccuracy/mistake/miss/blunder a missed chance always opens the card.
 * 2. **Otherwise the bigger prize leads**, priced the same way a claim's own
 *    headline is (kind first, then size), so a won queen outranks a saved
 *    bishop on a good move too, and an equal pair keeps the order the cards
 *    have always had.
 */
export type TacticCardKind = 'prevention' | 'opportunity';

export interface TacticCardOrderInput {
  quality?: MoveQuality;
  tacticOpportunity?: { found: boolean; gain?: TacticGainDto } | null;
  tacticPrevention?: { prevented: boolean; gain?: TacticGainDto } | null;
}

/** Both kinds, in the order they should be read. A move missing one of them
 * still gets both names back — the caller renders what it has. */
export function orderTacticCards(move: TacticCardOrderInput): TacticCardKind[] {
  return opportunityLeadsCard(move) ? ['opportunity', 'prevention'] : ['prevention', 'opportunity'];
}

export function opportunityLeadsCard(move: TacticCardOrderInput): boolean {
  const opportunity = move.tacticOpportunity;
  if (!opportunity) return false;
  if (!move.tacticPrevention) return true;
  if (isImprovableQuality(move.quality) && !opportunity.found) return true;
  return cardWeight(opportunity.gain) > cardWeight(move.tacticPrevention.gain);
}

/** A card with no verified gain — an older stored report, or a motif whose
 * claim promised nothing — never outranks one that names a prize. */
function cardWeight(gain: TacticGainDto | undefined): number {
  if (!gain) return 0;
  return GAIN_KIND_WEIGHT[gain.kind] + Math.max(0, gain.pawns);
}
