import { Chess, type Color, type Square } from 'chess.js';
import type { TacticHorizon } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { see } from './see.js';
import { PIECE_VALUES } from './tactics.js';
import { attackersOf, defendersOf, enemyTargetsOf, pieceTypeAt, pieceValueAt } from './tactic-board-facts.js';
import type { TacticClaim } from './tactic-claim.js';
import { isRecapture, type TacticDetectionContext } from './tactic-detectors/context.js';

/** How far away the claim's payoff is — `null` on a claim verified purely
 * statically, where we know the shape pays but not when. */
export type { TacticHorizon } from '@freechesscoach/shared';

export interface VerifiedTacticClaim extends TacticClaim {
  /** 0-1. `docs/tactics-rework.md` §3 rule 2 spends this on specificity:
   * squares at high confidence, the bare motif at medium, silence below. */
  confidence: number;
  /** What the claim is worth once checked, in pawns — the number the
   * sentence's "win a rook" slot is allowed to be built from. */
  verifiedGain: number;
  horizon: TacticHorizon | null;
  verifiedBy: 'static' | 'line';
}

interface Verdict {
  ok: boolean;
  confidence: number;
  gain: number;
}

const REJECT: Verdict = { ok: false, confidence: 0, gain: 0 };

/**
 * Layer 2, static half: which proposed claims survive without an engine
 * line?
 *
 * The line-verification half (`verify-tactic-line.ts`) is stronger and is
 * used wherever the pipeline has a PV, but it cannot be the only gate:
 * `classifyTacticMotif` is called from places that have no engine at all
 * (the precision corpora, the bot's candidate scan, a puzzle fixture), and a
 * claim that shipped unverified there is exactly the phantom fork
 * `docs/tactics-rework.md` §1 is about.
 *
 * What every gate here has in common is that it asks about the claim's own
 * *payoff*, never about the mover's safety. §2 prototyped a static-safety
 * gate ("reject if the moving piece can be profitably captured") and it cuts
 * noise 22.4% → 8.6% while destroying sacrificial tactics — TR-07's bishop
 * is en prise by +330 on purpose. Where a gate does ask whether a piece
 * survives, it asks about the piece the *mechanism* depends on: a fork only
 * forks if the forking piece is still there next move, which is the same
 * `is_in_bad_spot` guard Lichess's own tagger applies to a forker.
 */
export function verifyTacticClaims(context: TacticDetectionContext, claims: readonly TacticClaim[]): VerifiedTacticClaim[] {
  if (!context.after) return [];
  const verified: VerifiedTacticClaim[] = [];

  for (const claim of claims) {
    const verdict = verdictFor(context, claim);
    if (!verdict.ok) continue;
    verified.push({
      ...claim,
      confidence: verdict.confidence,
      verifiedGain: verdict.gain,
      horizon: null,
      verifiedBy: 'static'
    });
  }
  return verified;
}

function verdictFor(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  switch (claim.type) {
    case 'fork':
      return verifyFork(context, claim);
    case 'pin':
      return verifyPin(context, claim);
    case 'skewer':
      return verifySkewer(context, claim);
    case 'freePiece':
      return verifyFreePiece(context, claim);
    case 'trappedPiece':
      return verifyTrappedPiece(context, claim);
    case 'discoveredAttack':
      return verifyWinnableVictim(context, claim, 0.7);
    case 'removesDefender':
      return verifyRemovesDefender(context, claim);
    case 'deflection':
    case 'interference':
      // Both promise a specific enemy piece, so both answer to the same
      // question the discovered attack does: is that piece actually takeable?
      return verifyWinnableVictim(context, claim, 0.6);
    case 'overloadedDefender':
      // Sole defender of two attacked pieces, by construction in
      // `piece-safety.ts` — the shape *is* the evidence, and the claim makes
      // no material promise for a static gate to check.
      return { ok: true, confidence: 0.5, gain: 0 };
    case 'doubleCheck':
    case 'discoveredCheck':
    case 'weakBackRank':
      // Forcing by construction: the opponent has no choice about answering
      // it, so there is nothing left to verify that the board hasn't shown.
      return { ok: true, confidence: 0.9, gain: claim.expectedGain };
    default:
      // Every motif added by phase D carries its own gate inside its
      // detector — a defensive claim is verified by the enemy claim it
      // removes, a positional one by the feature it changes, and neither is
      // an exchange question this file can answer. They sit at high
      // confidence because a detector that fired has already checked the
      // board fact it names, which is what earns the card its squares.
      return { ok: true, confidence: CONFIG.tacticVerification.highConfidence, gain: claim.expectedGain };
  }
}

/** SEE on a square after the move, in pawns rather than centipawns. Goes
 * through the context's memo (`tactic-detectors/facts.ts`) because several
 * gates ask about the same square and SEE builds a board per capture in the
 * exchange. */
function exchangeAfterPawns(context: TacticDetectionContext, square: Square, capturer: Color): number {
  return context.facts.exchangeAfter(square, capturer) / 100;
}

/** The same on the position before the move. */
function exchangeBeforePawns(context: TacticDetectionContext, square: Square, capturer: Color): number {
  return context.facts.exchangeBefore(square, capturer) / 100;
}

/**
 * A fork is a fork only if the forking piece is still on the board to
 * collect: TR-03's bishop "forks" b7 and d7 while standing en prise to both,
 * so `bxc6` answers it and nothing is won. Then at least two of the targets
 * have to be genuinely takeable — the enemy king counts, since it must move
 * and cannot be defended.
 */
function verifyFork(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  if (exchangeAfterPawns(context, claim.actor, context.opponent) > 0) return REJECT;

  const collectible = claim.targets.filter(
    (square) => pieceTypeAt(context.after!, square) === 'k' || exchangeAfterPawns(context, square, context.mover) > 0
  );
  if (collectible.length < 2) return REJECT;

  const gain = Math.max(...collectible.map((square) => winnableValue(context, square)));
  if (gain < CONFIG.tacticVerification.minStaticGainPawns) return REJECT;
  return { ok: true, confidence: 0.85, gain };
}

/**
 * A pin needs its pinner to survive (an en-prise pinner is a trade), a
 * victim worth pinning (a pinned pawn is almost never a tactic — TR-05), and
 * either the enemy king behind it or real pressure on the pinned piece. The
 * two absolute pins in the fixture, TR-01 and TR-10, win no material at all;
 * they survive on the positional rung, which is why this returns a gain of
 * zero and a `positional` claim rather than a material one.
 */
function verifyPin(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  const after = context.after!;
  const [pinned, against] = claim.targets;
  if (!pinned || !against) return REJECT;
  if (exchangeAfterPawns(context, claim.actor, context.opponent) > 0) return REJECT;

  // Absolute: the piece behind is the king, so the pinned piece genuinely
  // cannot move. That holds for a pawn too — a pinned pawn that cannot
  // capture or advance is a real bind, and Lichess tags 8 of its 40 pin
  // puzzles on exactly that.
  if (pieceTypeAt(after, against) === 'k') return { ok: true, confidence: 0.8, gain: 0 };

  // A king in front is not pinned — it is in check, and the piece behind it
  // is a skewer's prize. `pins()` reports the shape because the king is just
  // the first piece it meets on the ray; naming it is the skewer detector's
  // job, and `verifySkewer` already prices it.
  if (pieceTypeAt(after, pinned) === 'k') return REJECT;

  // Relative: nothing forbids the pinned piece from moving, so the only thing
  // holding it is what the pinner collects if it does. If that collection
  // loses material the piece is free to step aside and the "pin" is a
  // coincidence of geometry — a queen lined up on a knight and the rook
  // behind it pins nothing when the rook is defended, because Qxr Kxq is a
  // gift, not a threat.
  if (!winsThePieceBehind(context, pinned, against)) return REJECT;

  // A pinned pawn is a tactic only when the pin takes away something the pawn
  // itself was doing — a capture it was eyeing, or a piece it alone guards —
  // never merely because the pawn is outnumbered. "Outnumbered" is a hanging
  // pawn wearing a pin's geometry, the exact shape of TR-05's phantom: a queen
  // on the long diagonal "pins" g7 to h8 in a few hundred games out of a
  // thousand, and the pawn is guarded as often as it is hit. A relative pin
  // on anything else keeps asking that pressure question below.
  if (pieceTypeAt(after, pinned) === 'p') {
    if (pawnPinDeniesSomething(context, pinned)) return { ok: true, confidence: 0.5, gain: 0 };
    return REJECT;
  }

  // Relative: the pinned piece *may* move, it just costs material to, so
  // the pin is only a tactic if the piece is under real pressure.
  const attackers = attackersOf(context.afterAttackMap!, pinned, context.mover).length;
  const defenders = defendersOf(context.afterAttackMap!, pinned, context.opponent).length;
  if (attackers > defenders) return { ok: true, confidence: 0.55, gain: 0 };

  // No extra pressure yet, but a piece pinned against something much more
  // valuable is still a bind worth naming — you pile on next move.
  const gap = pieceValueAt(after, against) - pieceValueAt(after, pinned);
  if (gap >= 2) return { ok: true, confidence: 0.45, gain: 0 };
  return REJECT;
}

/**
 * Whether the pinner actually wins the piece behind once the pinned piece
 * steps off the line — the question that separates a pin from three pieces
 * that happen to share a ray.
 *
 * Asked by lifting the pinned piece off the board and running the exchange on
 * the square behind it, so the answer accounts for every defender of that
 * square rather than only its bare value. That matters most when the pinner
 * is the queen: a "pin" against anything cheaper than she is only binds while
 * the piece behind is takeable, and the whole point of the bind is that
 * stepping aside is what costs them.
 */
function winsThePieceBehind(context: TacticDetectionContext, pinned: Square, against: Square): boolean {
  const vacated = new Chess(context.after!.fen());
  vacated.remove(pinned);
  return see(vacated.fen(), against, context.mover) > 0;
}

/**
 * Whether pinning this pawn costs its owner one of the two things a pawn
 * actually does: capture something, or guard something. Neither question is
 * about material pressure on the pawn itself — a pawn that's simply attacked
 * more than it's defended is answered by `freePiece`/`defendsHangingPiece`,
 * not by naming the pin. This is what makes a pin on a pawn a bind rather
 * than noise: the opponent wanted to play the pawn's own move and can't.
 */
function pawnPinDeniesSomething(context: TacticDetectionContext, pinned: Square): boolean {
  const after = context.after!;
  const attackMap = context.afterAttackMap!;

  // The pawn had a capture of its own lined up and can no longer take it.
  if (enemyTargetsOf(after, attackMap, pinned, context.mover).length > 0) return true;

  // The pawn is the (or a load-bearing) guard of a friendly piece — pin it
  // and that piece is a capture closer to falling than it looks.
  const guarded = (attackMap.controlledBy.get(pinned) ?? []).filter((square) => after.get(square)?.color === context.opponent);
  return guarded.some((square) => {
    const guardedAttackers = attackersOf(attackMap, square, context.mover).length;
    const guardedDefenders = defendersOf(attackMap, square, context.opponent).length;
    return guardedAttackers >= guardedDefenders;
  });
}

/** The skewered pair only pays if the piece in front actually has to move —
 * a queen "skewering" a defended pawn skewers nothing — and if the piece
 * behind is then takeable. */
function verifySkewer(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  const after = context.after!;
  const [front, behind] = claim.targets;
  if (!front || !behind) return REJECT;
  if (exchangeAfterPawns(context, claim.actor, context.opponent) > 0) return REJECT;

  const frontMustMove = pieceTypeAt(after, front) === 'k' || exchangeAfterPawns(context, front, context.mover) > 0;
  if (!frontMustMove) return REJECT;

  // The prize is priced statically rather than by SEE: the whole mechanism
  // is that the piece in front is still standing in the way, so an exchange
  // evaluation on the square behind it correctly reports that nothing can
  // be taken there *yet* — which is the one thing a skewer is not evidence
  // against.
  const gain = pieceValueAt(after, behind);
  if (gain < CONFIG.tacticVerification.minStaticGainPawns) return REJECT;
  const defended = defendersOf(context.afterAttackMap!, behind, context.opponent).length > 0;
  return { ok: true, confidence: defended ? 0.6 : 0.75, gain };
}

/**
 * "Free" has to mean the opponent gave something away, not that material
 * changed hands. Three ways a capture fails that, all of them measured in
 * `docs/tactics-rework.md` §2:
 *
 * 1. It takes back on the square they just took on (TR-04) — the most
 *    ordinary move in chess, and 97 of 113 of them carried this label.
 * 2. They captured somewhere last move and this takes no more than they did
 *    (TR-05's `Qxd4`, restoring the pawn lost to `exd4` two plies earlier) —
 *    an exchange sequence settling, not a windfall.
 * 3. The exchange on the square doesn't actually win anything.
 */
function verifyFreePiece(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  if (isRecapture(context)) return REJECT;
  const captured = context.move?.captured;
  if (!captured) return REJECT;

  const previous = context.previous;
  if (previous?.wasCapture && PIECE_VALUES[captured] <= capturedValueOfPrevious(context)) return REJECT;

  const gain = exchangeBeforePawns(context, claim.actor, context.mover);
  if (gain < CONFIG.tacticVerification.minStaticGainPawns) return REJECT;
  return { ok: true, confidence: 0.8, gain };
}

/** What the opponent's previous capture was worth, in pawns. The move list
 * gives us the square, not the piece, so this reads the value off the piece
 * that ended up standing there — the capturer — as the closest available
 * proxy for the size of the exchange being settled. */
function capturedValueOfPrevious(context: TacticDetectionContext): number {
  const previous = context.previous;
  if (!previous) return 0;
  const piece = context.before.get(previous.to);
  return piece ? PIECE_VALUES[piece.type] : 0;
}

/** A trapped piece is only worth naming if taking it is worth the trip —
 * otherwise "trapped" describes a knight in a corner nobody wants. */
function verifyTrappedPiece(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  if (!claim.victim) return REJECT;
  const gain = winnableValue(context, claim.victim);
  if (gain < CONFIG.tacticVerification.minStaticGainPawns) return REJECT;
  return { ok: true, confidence: 0.6, gain };
}

/** The shared shape of every claim whose whole promise is one enemy piece:
 * that piece has to be takeable at a profit. */
function verifyWinnableVictim(context: TacticDetectionContext, claim: TacticClaim, confidence: number): Verdict {
  if (!claim.victim) return { ok: true, confidence: confidence * 0.7, gain: 0 };
  const gain = winnableValue(context, claim.victim);
  if (gain < CONFIG.tacticVerification.minStaticGainPawns) return REJECT;
  return { ok: true, confidence, gain };
}

/**
 * Removing a defender by giving up more than the exposed piece is worth is a
 * sacrifice, and a sacrifice is exactly the thing a static gate cannot
 * judge — TR-03 loses a bishop to win a pawn back and reads as a deflection
 * to this file. So the static rung asks for the removal itself to be sound
 * and leaves genuinely sacrificial deflections to line verification, which
 * can see whether the line pays.
 */
function verifyRemovesDefender(context: TacticDetectionContext, claim: TacticClaim): Verdict {
  if (exchangeBeforePawns(context, claim.actor, context.mover) < 0) return REJECT;
  return verifyWinnableVictim(context, claim, 0.7);
}

/** What taking the piece on `square` is actually worth to the mover, capped
 * by the exchange that follows it. */
function winnableValue(context: TacticDetectionContext, square: Square): number {
  return Math.max(0, exchangeAfterPawns(context, square, context.mover));
}
