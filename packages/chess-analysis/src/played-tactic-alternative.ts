import type { ClassifiedMoveDto, EngineEval, MoveQuality } from '@freechesscoach/shared';
import { classifyTacticClaims, type TacticClassification } from './classify-tactic-motif.js';
import { gainWeight } from './rank-tactic-claims.js';
import { CONFIG } from './config.js';
import type { PreviousMove } from './tactic-detectors/context.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

/**
 * The tactic the player's *own* move carried, when their move was as good as
 * the engine's first line and the tactic is worth at least as much.
 *
 * The opportunity card is built from `evals[ply].lines[0]` alone, so any
 * other move is a "miss" by construction — which is how a knight fork that
 * won a queen with check printed
 *
 *     You missed a chance to win a queen through a trapped piece two moves
 *     away with Bb5 — queen on d7 is trapped.
 *
 * on the move that took the queen. The engine's first line is one of several
 * equal moves, not the only one; `docs/tactics-rework.md` §7 names this
 * exact case ("stop calling a move a miss when it was second-best at equal
 * evaluation"). This answers it from the data every ply already has: the
 * move's own drop, and its own claims verified against the engine's
 * continuation *after* it.
 *
 * Deliberately narrow. It never invents an opportunity where the engine's
 * best move had none (the caller checks that first, so the report's
 * opportunity *counts* are untouched), and it never demotes a real miss: a
 * move whose own best claim is worth less than the one it passed up — or
 * that passed up mate — keeps the miss it earned.
 */
export interface PlayedTacticAlternativeInput {
  move: ClassifiedMoveDto;
  evals: EngineEval[];
  /** The engine's-best-move classification this would replace. */
  best: TacticClassification;
  previous: PreviousMove | null;
}

/**
 * Tiers whose win% drop is at most `CONFIG.severity.excellentMaxDrop` by
 * definition — i.e. the move gave up nothing measurable. Not
 * `BEST_OR_BETTER`: that set answers "did the player play the engine's
 * move?", and the whole point here is that they played a different one.
 * `drop` decides whenever the move carries it; this covers a move stored
 * before it did.
 */
const { excellentMaxDrop: EXCELLENT_MAX_DROP } = CONFIG.severity;
const AS_GOOD_AS_BEST: ReadonlySet<MoveQuality> = new Set(['brilliant', 'great', 'best', 'excellent']);

export function classifyPlayedTacticAlternative(input: PlayedTacticAlternativeInput): TacticClassification | null {
  const { move } = input;
  if (!move.fenBefore || !move.moveSan) return null;

  const played = classifyTacticClaims({
    fenBefore: move.fenBefore,
    moveSan: move.moveSan,
    mover: move.mover,
    quality: move.quality,
    isCheckmate: move.moveFlags?.isCheckmate ?? false,
    isTacticalPosition: move.isTacticalPosition === true,
    previous: input.previous,
    pvSan: continuationOf(move, input.evals)
  });
  const headline = headlineOf(played);
  if (!headline) return null;
  // A missed mate stays missed. Nothing short of mate is "as much", and the
  // pawn-weighted comparison below would happily rank a won queen above it.
  if (headlineOf(input.best)?.gainKind === 'mate' && headline.gainKind !== 'mate') return null;
  if (worthOf(headline) < worthOf(headlineOf(input.best)) - CONFIG.tacticVerification.equalPrizeTolerancePawns) return null;

  // Two ways their move earns the card: it cost nothing, or it actually
  // collected the material. The second is what a royal fork is — a knight
  // that checks the king and takes the queen has taken the queen, whatever
  // else the move also threw away, and "you missed a chance to win a queen"
  // is simply false on it. The blunder badge and `tactic-allowed.ts` carry
  // what the move cost; this card carries what it did.
  return isEqualValueAlternative(move) || collectsMaterial(headline) ? played : null;
}

function isEqualValueAlternative(move: ClassifiedMoveDto): boolean {
  if (move.drop !== undefined) return move.drop <= EXCELLENT_MAX_DROP;
  return AS_GOOD_AS_BEST.has(move.quality);
}

function collectsMaterial(headline: VerifiedTacticClaim): boolean {
  if (headline.gainKind === 'mate') return true;
  return headline.gainKind === 'material' && headline.verifiedGain >= CONFIG.tacticVerification.minStaticGainPawns;
}

/** The engine's own line from *after* this move, with the move itself in
 * front — the same shape `evals[ply - 1].lines[0].pvSan` has for the best
 * move, so `verifyTacticClaimsAgainstLine` asks the played move's claims the
 * same question it asks the engine's. */
function continuationOf(move: ClassifiedMoveDto, evals: EngineEval[]): string[] | undefined {
  const after = evals[move.ply]?.lines[0]?.pvSan;
  if (!after || after.length === 0) return undefined;
  return [move.moveSan, ...after];
}

function headlineOf(classification: TacticClassification): VerifiedTacticClaim | undefined {
  return classification.claims.find((claim) => claim.type === classification.headline);
}

/** Kind and size, deliberately without confidence: "did their move win as
 * much?" must not flip on the difference between a 0.85 and a 0.95
 * verification — nor, within `equalPrizeTolerancePawns`, on two ways of
 * pricing the same queen. */
function worthOf(headline: VerifiedTacticClaim | undefined): number {
  return headline ? gainWeight(headline.gainKind, headline.verifiedGain) : 0;
}
