import type { TacticGainDto, TacticHorizon, TacticMotifType } from '@freechesscoach/shared';
import { TACTIC_MOTIF_PHRASES, articleFor, motifWithArticle } from './tactic-motif-phrases.js';

/** How much a card may name: squares and the piece at high confidence, the
 * bare motif at medium, "material" at low (`tactic-reason-text.ts`). */
export type Specificity = 'high' | 'medium' | 'low';

/** What a card's claim is worth, in the three grammatical forms the card
 * sentences of `tactic-reason-text.ts` use it in. */
export interface GainClause {
  /** Past tense: "won a rook through a fork". */
  did: string;
  /** Infinitive: "win a rook through a fork". */
  toDo: string;
  /** After "stopped you …": "winning a rook through a fork". */
  gerundish: string;
}

/**
 * The heart of the template. A material or mate payoff leads — "won a rook
 * through a fork" — because that is the half the reader can act on. A motif
 * with no material to name falls back to its own action phrase, which is how
 * a pin that binds and a move that breaks a pin both still get a sentence
 * without either of them inventing a prize.
 */
export function gainClause(
  claim: { type: TacticMotifType; gain?: TacticGainDto },
  specificity: Specificity,
  horizon: TacticHorizon | undefined
): GainClause {
  const phrases = TACTIC_MOTIF_PHRASES[claim.type];
  const prize = materialPrize(claim.gain, specificity);
  const motif = motifWithHorizon(claim.type, horizon);

  if (claim.gain?.kind === 'mate') return mateClause(claim.type, claim.gain.mateIn, horizon);
  if (prize) {
    return {
      did: `won ${prize} through ${motif}`,
      toDo: `win ${prize} through ${motif}`,
      gerundish: `winning ${prize} through ${motif}`
    };
  }
  return { did: phrases.did, toDo: phrases.toDo, gerundish: gerundOf(phrases.toDo) };
}

/**
 * A mate says in how many moves (the owner's calibration, 2026-10-01: "They
 * forced mate." with mate in 5 on the board). `mateIn` counts the card's own
 * move as the first, and each voice says the number a player would:
 *
 * - `did` is only ever said of a move that was played, so it counts from
 *   the position after it: "forced mate in 5";
 * - `toDo` and `gerundish` are followed by the move they name, so they
 *   count from it: "force mate in 6 with Qxh3";
 * - a move that is itself the mate is checkmate, with nothing to count.
 *
 * The number replaces the horizon ("a mating net two moves away"): it says
 * the same thing exactly. A card with no distance keeps the old sentence.
 */
function mateClause(type: TacticMotifType, mateIn: number | undefined, horizon: TacticHorizon | undefined): GainClause {
  // "forced mate through a checkmate" says the same thing twice.
  const through = type === 'checkmate' ? '' : ` through ${motifWithHorizon(type, mateIn === undefined ? horizon : undefined)}`;
  if (mateIn === undefined) return { did: `forced mate${through}`, toDo: `force mate${through}`, gerundish: `forcing mate${through}` };
  if (mateIn === 1) {
    return { did: `delivered checkmate${through}`, toDo: `deliver checkmate${through}`, gerundish: `delivering checkmate${through}` };
  }
  return {
    did: `forced mate in ${mateIn - 1}${through}`,
    toDo: `force mate in ${mateIn}${through}`,
    gerundish: `forcing mate in ${mateIn}${through}`
  };
}

/**
 * "a fork" / "a fork two moves away" / "an eventual fork".
 *
 * §3 rule 5: a horizon qualifier is what makes a deep tactic honest instead
 * of confusing. `annotatePvTactics` has computed how far off the payoff is
 * since long before this, and nothing narrated it.
 */
function motifWithHorizon(type: TacticMotifType, horizon: TacticHorizon | undefined): string {
  const noun = TACTIC_MOTIF_PHRASES[type].noun;
  if (horizon === 'inTwo') return `${motifWithArticle(type)} two moves away`;
  if (horizon === 'eventual') return `an eventual ${noun}`;
  return motifWithArticle(type);
}

/** "a rook" at high confidence, "material" when the verifier proved a swing
 * but not which piece, and nothing at all when it proved neither. */
function materialPrize(gain: TacticGainDto | undefined, specificity: Specificity): string | null {
  if (!gain || gain.kind !== 'material' || gain.pawns <= 0) return null;
  if (gain.prize && specificity !== 'low') return `${articleFor(gain.prize)} ${gain.prize}`;
  return 'material';
}

/** "break the pin" -> "breaking the pin". Only ever applied to the motif
 * phrases' own `toDo`, whose first word is a bare infinitive by
 * construction — never to arbitrary text. */
function gerundOf(infinitive: string): string {
  const [verb, ...rest] = infinitive.split(' ');
  if (!verb) return infinitive;
  const stem = verb.endsWith('e') && !verb.endsWith('ee') ? verb.slice(0, -1) : verb;
  return [`${stem}ing`, ...rest].join(' ');
}
