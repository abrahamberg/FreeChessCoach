import type { TacticGainDto, TacticHorizon, TacticMotifType } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { gainClause, type Specificity } from './tactic-gain-clause.js';
import { TACTIC_MOTIF_PHRASES, articleFor } from './tactic-motif-phrases.js';

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
  const clause = gainClause(opportunity, specificity, opportunity.horizon);
  const detail = specificity === 'high' && opportunity.detail ? ` — ${opportunity.detail}` : '';

  if (opportunity.isUserMove === undefined) return legacyOpportunityReason(opportunity, bestMoveSan, detail);
  const subject = opportunity.isUserMove ? 'You' : 'They';
  if (opportunity.found) return `${subject} ${clause.did}${detail}.`;
  const move = bestMoveSan ? ` with ${bestMoveSan}` : '';
  return `${subject} missed a chance to ${clause.toDo}${move}${detail}.`;
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

export interface TacticAllowedLike {
  type: TacticMotifType;
  detail?: string | null;
  gain?: TacticGainDto;
  horizon?: TacticHorizon;
  confidence?: number;
  /** The reply that collects it. */
  byMoveSan?: string;
  /** True when the reader is the player who made the move that allowed it. */
  isUserMove?: boolean;
}

/**
 * The card for what this move handed the other side — §5 layer 4's fourth
 * outcome verb, and the one that says why a blunder was one.
 *
 * It is written from the same 2×2 as the other two: the move belongs to
 * whoever made it, and the tactic belongs to the other side. The move that
 * dropped a queen reads "They let you win a queen through a pin with Bb5"
 * when the opponent played it, and "You let them win a queen…" when the
 * reader did.
 *
 * Unlike the opportunity card, this one always names the move — the whole
 * point is to show the reader the reply they are about to face (or the one
 * they are about to get), and a card that says a queen is falling without
 * saying to what is a riddle.
 */
export function tacticAllowedReason(allowed: TacticAllowedLike): string {
  const specificity = specificityOf(allowed.confidence);
  const clause = gainClause(allowed, specificity, allowed.horizon);
  const detail = specificity === 'high' && allowed.detail ? ` — ${allowed.detail}` : '';
  const move = allowed.byMoveSan ? ` with ${allowed.byMoveSan}` : '';
  const subject = allowed.isUserMove ? 'You let them' : 'They let you';
  return `${subject} ${clause.toDo}${move}${detail}.`;
}

export interface TacticPreventionLike {
  type: TacticMotifType;
  prevented: boolean;
  /** The threat's move: the opponent's, from the board before this move. */
  threatSan?: string;
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
 * Like the allowed card it names the move (`threatClause`).
 */
export function tacticPreventionReason(prevention: TacticPreventionLike): string {
  const clause = gainClause(prevention, 'medium', undefined);
  const threat = threatClause(prevention);

  if (prevention.isUserMove === undefined) return legacyPreventionReason(prevention, threat);
  if (prevention.prevented && prevention.isUserMove) return `You stopped them ${clause.gerundish}${threat}.`;
  if (prevention.prevented) return `Their move stopped you ${clause.gerundish}${threat}.`;
  // Nothing was defused, so the threat still belongs to whoever did not
  // just move — the mirror image of the two lines above.
  const owner = prevention.isUserMove ? 'They' : 'You';
  return `${owner} can still ${clause.toDo}${threat}.`;
}

/**
 * " with Qxe8+ — captures the rook on e8". The detail describes the board
 * after the threat's move, so it is printed only behind that move: without
 * it, "rook on d5 forks …" read as the board in front of the reader, whose
 * rook stood on d8. A card stored before it named the move gets neither.
 */
function threatClause(prevention: TacticPreventionLike): string {
  if (!prevention.threatSan) return '';
  const detail = prevention.detail ? ` — ${prevention.detail}` : '';
  return ` with ${prevention.threatSan}${detail}`;
}

/** Same reason as `legacyOpportunityReason`: no `isUserMove`, no pronoun. */
function legacyPreventionReason(prevention: TacticPreventionLike, threat: string): string {
  const noun = TACTIC_MOTIF_PHRASES[prevention.type].noun;
  return prevention.prevented
    ? `Defused the opponent's ${noun}${threat}.`
    : `Left the opponent's ${noun} in play${threat}.`;
}

/**
 * Absent confidence means the card predates verification, and those cards
 * always printed their geometry — degrading them to the bare motif now would
 * quietly rewrite what a stored report says. Only a claim that was actually
 * scored can be scored low.
 */
function specificityOf(confidence: number | undefined): Specificity {
  if (confidence === undefined) return 'high';
  if (confidence >= CONFIG.tacticVerification.highConfidence) return 'high';
  if (confidence >= CONFIG.tacticVerification.mediumConfidence) return 'medium';
  return 'low';
}
