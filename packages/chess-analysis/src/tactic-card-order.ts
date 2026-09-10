import { isImprovableQuality, type MoveQuality, type TacticGainDto } from '@freechesscoach/shared';
import { gainWeight } from './rank-tactic-claims.js';

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
 * 0. **What the move handed over opens the card**, when there is such a
 *    sentence at all — see `orderTacticCards`.
 * 1. **A move that cost evaluation is read for what it missed.** Whatever
 *    good the move also did, it is not why the move is on screen — so on an
 *    inaccuracy/mistake/miss/blunder a missed chance always opens the card.
 * 2. **Otherwise the bigger prize leads**, priced the same way a claim's own
 *    headline is (kind first, then size), so a won queen outranks a saved
 *    bishop on a good move too, and an equal pair keeps the order the cards
 *    have always had.
 */
export type TacticCardKind = 'allowed' | 'prevention' | 'opportunity';

export interface TacticCardOrderInput {
  quality?: MoveQuality;
  tacticAllowed?: { gain?: TacticGainDto } | null;
  tacticOpportunity?: { found: boolean; gain?: TacticGainDto } | null;
  tacticPrevention?: { prevented: boolean; gain?: TacticGainDto } | null;
}

/** Every kind, in the order they should be read. A move missing some of them
 * still gets all three names back — the caller renders what it has. */
export function orderTacticCards(move: TacticCardOrderInput): TacticCardKind[] {
  // What the move handed over always opens: `tactic-allowed.ts` only builds
  // that card on a move that cost evaluation and gave up material or mate,
  // which is the same thing as the reason the move is flagged at all.
  const rest: TacticCardKind[] = opportunityLeadsCard(move)
    ? ['opportunity', 'prevention']
    : ['prevention', 'opportunity'];
  return ['allowed', ...rest];
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
  return gain ? gainWeight(gain.kind, gain.pawns) : 0;
}
