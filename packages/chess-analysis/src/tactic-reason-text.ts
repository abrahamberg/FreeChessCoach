import type { TacticGainDto, TacticHorizon, TacticMotifType } from '@freechesscoach/shared';
import { TACTIC_MOTIF_FAMILY } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { TACTIC_MOTIF_PHRASES, articleFor, motifWithArticle } from './tactic-motif-phrases.js';

/**
 * Layer 4 of `docs/tactics-rework.md` §5: one template, four voices, three
 * levels of specificity.
 *
 *     <subject> <outcome-verb> <gain> <horizon?> through <motif>
 *
 * Three things about it are load-bearing, and all three are why the shipped
 * copy was wrong rather than merely plain:
 *
 * 1. **The gain is a required slot.** "Found the <motif> — <geometry>" was
 *    printable the instant a shape matched, so nothing in the pipeline was
 *    ever obliged to compute a consequence. A claim that reaches here with
 *    no gain gets its motif's own action phrase instead, and one with
 *    nothing to say at all gets no sentence.
 * 2. **The subject is the reader, not the mover.** Every card is written to
 *    the person whose review this is, so an opponent's move reads "They …".
 *    `isUserMove` has been on every move all along and this file never read
 *    it, which is how "Defused the *opponent's* fork" ended up printing on
 *    moves where the opponent *was* the reader.
 * 3. **Specificity is earned.** Squares only at high confidence, the bare
 *    motif at medium — chess.com never names a square, and a 1200-rated
 *    reader can't act on one anyway.
 */

export interface TacticOpportunityLike {
  type: TacticMotifType;
  found: boolean;
  detail?: string | null;
  gain?: TacticGainDto;
  horizon?: TacticHorizon;
  confidence?: number;
  /** True when the reader is the player who was on move here. Absent on a
   * report stored before the voice rewrite; the card then falls back to the
   * mover-neutral wording rather than guessing a pronoun. */
  isUserMove?: boolean;
}

/**
 * The card for a tactic the engine's best move embodied — did the player
 * play it?
 *
 * `bestMoveSan` is the fallback subject when there is nothing else to name:
 * a stored report from before verification carries no gain, and naming the
 * move is better than naming nothing.
 */
export function tacticOpportunityReason(opportunity: TacticOpportunityLike, bestMoveSan: string | undefined): string {
  const specificity = specificityOf(opportunity.confidence);
  const clause = gainClause(opportunity, specificity);
  const detail = specificity === 'high' && opportunity.detail ? ` — ${opportunity.detail}` : '';

  if (opportunity.isUserMove === undefined) return legacyOpportunityReason(opportunity, bestMoveSan, detail);
  const subject = opportunity.isUserMove ? 'You' : 'They';
  if (opportunity.found) return `${subject} ${clause.did}${detail}.`;
  const move = bestMoveSan ? ` — ${bestMoveSan} was there` : '';
  return `${subject} missed a chance to ${clause.toDo}${move}.`;
}

/** A report stored before the voice rewrite has no `isUserMove` on its
 * opportunity, so there is no honest pronoun to use. Rather than guess one
 * — guessing is what printed "Found the fork" on the opponent's moves — an
 * old card keeps the mover-neutral wording it was written with. */
function legacyOpportunityReason(opportunity: TacticOpportunityLike, bestMoveSan: string | undefined, detail: string): string {
  const noun = TACTIC_MOTIF_PHRASES[opportunity.type].noun;
  if (opportunity.found) return `Found the ${noun}${detail || (bestMoveSan ? ` with ${bestMoveSan}` : '')}.`;
  return `Missed ${articleFor(noun)} ${noun}${detail || (bestMoveSan ? `, available with ${bestMoveSan}` : '')}.`;
}

export interface TacticPreventionLike {
  type: TacticMotifType;
  prevented: boolean;
  detail?: string | null;
  gain?: TacticGainDto;
  /** Whose move defused (or failed to defuse) the threat — see
   * `TacticOpportunityLike.isUserMove`. */
  isUserMove?: boolean;
}

/**
 * The card for a threat the *other* side had before this move.
 *
 * §3 rule 4: a defused threat is the reader's own lost chance, not a third
 * party's achievement. "Defused the opponent's fork" is a log line; "their
 * move stopped you winning a rook through a fork" is the same computation
 * told to the person reading it. The threat always belongs to whoever did
 * *not* make this move, which is what makes the two voices mirror images.
 */
export function tacticPreventionReason(prevention: TacticPreventionLike): string {
  const clause = gainClause(prevention, 'medium');
  const detail = prevention.detail ? ` — ${prevention.detail}` : '';

  if (prevention.isUserMove === undefined) return legacyPreventionReason(prevention, detail);
  if (prevention.prevented && prevention.isUserMove) return `You stopped them ${clause.gerundish}${detail}.`;
  if (prevention.prevented) return `Their move stopped you ${clause.gerundish}${detail}.`;
  // Nothing was defused, so the threat still belongs to whoever did not
  // just move — the mirror image of the two lines above.
  const owner = prevention.isUserMove ? 'They' : 'You';
  return `${owner} can still ${clause.toDo}${detail}.`;
}

/** Same reason as `legacyOpportunityReason`: no `isUserMove`, no pronoun. */
function legacyPreventionReason(prevention: TacticPreventionLike, detail: string): string {
  const noun = TACTIC_MOTIF_PHRASES[prevention.type].noun;
  return prevention.prevented
    ? `Defused the opponent's ${noun}${detail}.`
    : `Left the opponent's ${noun} in play${detail}.`;
}

type Specificity = 'high' | 'medium' | 'low';

function specificityOf(confidence: number | undefined): Specificity {
  if (confidence === undefined) return 'medium';
  if (confidence >= CONFIG.tacticVerification.highConfidence) return 'high';
  if (confidence >= CONFIG.tacticVerification.mediumConfidence) return 'medium';
  return 'low';
}

interface GainClause {
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
function gainClause(claim: { type: TacticMotifType; gain?: TacticGainDto }, specificity: Specificity): GainClause {
  const phrases = TACTIC_MOTIF_PHRASES[claim.type];
  const prize = materialPrize(claim.gain, specificity);

  if (claim.gain?.kind === 'mate') {
    return { did: `forced mate through ${motifWithArticle(claim.type)}`, toDo: `force mate through ${motifWithArticle(claim.type)}`, gerundish: `forcing mate through ${motifWithArticle(claim.type)}` };
  }
  if (prize) {
    return {
      did: `won ${prize} through ${motifWithArticle(claim.type)}`,
      toDo: `win ${prize} through ${motifWithArticle(claim.type)}`,
      gerundish: `winning ${prize} through ${motifWithArticle(claim.type)}`
    };
  }
  return { did: phrases.did, toDo: phrases.toDo, gerundish: gerundOf(phrases.toDo) };
}

/** "a rook" at high confidence, "material" when the verifier proved a swing
 * but not which piece, and nothing at all when it proved neither. */
function materialPrize(gain: TacticGainDto | undefined, specificity: Specificity): string | null {
  if (!gain || gain.kind !== 'material' || gain.pawns <= 0) return null;
  if (gain.prize && specificity !== 'low') return `${articleFor(gain.prize)} ${gain.prize}`;
  return 'material';
}

/** "break the pin" -> "breaking the pin". Only ever applied to this file's
 * own `toDo` phrases, whose first word is a bare infinitive by
 * construction — never to arbitrary text. */
function gerundOf(infinitive: string): string {
  const [verb, ...rest] = infinitive.split(' ');
  if (!verb) return infinitive;
  const stem = verb.endsWith('e') && !verb.endsWith('ee') ? verb.slice(0, -1) : verb;
  return [`${stem}ing`, ...rest].join(' ');
}

/** Whether this motif is something done TO the opponent, which is what
 * decides if "through a <motif>" reads at all — you don't win a rook
 * "through" a developing move. Exported for the coach-facing summaries that
 * group a game's motifs the same way the card does. */
export function isOffensiveMotif(type: TacticMotifType): boolean {
  return TACTIC_MOTIF_FAMILY[type] === 'offensive';
}
