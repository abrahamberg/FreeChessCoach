import type { TacticMotifType } from '@freechesscoach/shared';

/** Singular, lowercase noun phrases — reads naturally mid-sentence, unlike
 * TACTIC_MOTIF_LABELS (plural, capitalized — the stats dashboard's column
 * headers). Shared by both reason builders below so "fork"/"a fork" is
 * worded identically whether the player found one or let one stand. */
const TACTIC_MOTIF_NOUN_PHRASE: Record<TacticMotifType, string> = {
  checkmate: 'checkmate',
  brilliantSacrifice: 'brilliant sacrifice',
  doubleCheck: 'double check',
  fork: 'fork',
  skewer: 'skewer',
  pin: 'pin',
  discoveredAttack: 'discovered attack',
  overloadedDefender: 'overloaded defender',
  removesDefender: 'defender-removing tactic',
  weakBackRank: 'back-rank tactic',
  trappedPiece: 'trapped piece',
  freePiece: 'free piece',
  other: 'tactic'
};

function articleFor(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

export interface TacticOpportunityLike {
  type: TacticMotifType;
  found: boolean;
  detail?: string | null;
}

/** Combines the tactic finder's motif classification with the engine's own
 * best line into one plain-language sentence for a move's `reasons` (§11).
 * `detail` (describeTacticHit) already reads as a full clause naming the
 * concrete piece/square ("Knight on d5 forks c7 and e7") — repeating the SAN
 * alongside it read as redundant, so it's dropped whenever `detail` is
 * there; the SAN-only fallback still covers the rare case describeTacticHit
 * has nothing detector-specific to say. */
export function tacticOpportunityReason(opportunity: TacticOpportunityLike, bestMoveSan: string | undefined): string {
  const noun = TACTIC_MOTIF_NOUN_PHRASE[opportunity.type];
  const move = bestMoveSan ?? 'the best move here';

  if (opportunity.found) {
    return opportunity.detail ? `Found the ${noun} — ${opportunity.detail}.` : `Found the ${noun} with ${move}.`;
  }
  return opportunity.detail
    ? `Missed ${articleFor(noun)} ${noun} — ${opportunity.detail}.`
    : `Missed ${articleFor(noun)} ${noun}, available with ${move}.`;
}

export interface TacticPreventionLike {
  type: TacticMotifType;
  prevented: boolean;
  detail?: string | null;
}

/** The opponent's reachable threat, named in a sentence that reads as an
 * action taken (or not) rather than a status label — "Defused the
 * opponent's skewer — …" instead of "Opponent's Skewers threat: defused —
 * …". `detail` is the same full clause `tacticOpportunityReason` uses. */
export function tacticPreventionReason(prevention: TacticPreventionLike): string {
  const noun = TACTIC_MOTIF_NOUN_PHRASE[prevention.type];
  const detailClause = prevention.detail ? ` — ${prevention.detail}` : '';
  return prevention.prevented ? `Defused the opponent's ${noun}${detailClause}.` : `Left the opponent's ${noun} in play${detailClause}.`;
}
