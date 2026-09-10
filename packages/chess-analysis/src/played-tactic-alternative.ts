import type { ClassifiedMoveDto, EngineEval, MoveQuality } from '@freechesscoach/shared';
import { classifyTacticClaims, type TacticClassification } from './classify-tactic-motif.js';
import { claimScore } from './rank-tactic-claims.js';
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
 * move that cost evaluation, or whose own best claim is worth less than the
 * one it passed up, keeps the miss it earned.
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
  if (!move.fenBefore || !move.moveSan || !isEqualValueAlternative(move)) return null;

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
  if (!played.headline) return null;
  if (headlineWorth(played) < headlineWorth(input.best)) return null;
  return played;
}

function isEqualValueAlternative(move: ClassifiedMoveDto): boolean {
  if (move.drop !== undefined) return move.drop <= EXCELLENT_MAX_DROP;
  return AS_GOOD_AS_BEST.has(move.quality);
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

function headlineWorth(classification: TacticClassification): number {
  const headline: VerifiedTacticClaim | undefined = classification.claims.find(
    (claim) => claim.type === classification.headline
  );
  return headline ? claimScore(headline) : 0;
}
