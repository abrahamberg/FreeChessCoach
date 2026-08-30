import {
  TACTIC_MOTIF_TYPES,
  type ClassifiedMoveDto,
  type EngineEval,
  type MoveQuality,
  type TacticMotifCounts
} from '@freechesscoach/shared';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { moveFlags } from './move-flags.js';

const BEST_OR_BETTER: ReadonlySet<MoveQuality> = new Set(['brilliant', 'great', 'best']);

function emptyCounts(): TacticMotifCounts {
  const entries = TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const);
  return Object.fromEntries(entries) as TacticMotifCounts;
}

/**
 * For each of the colour's moves, tags the motif of the engine's best move
 * at that position (the "opportunity") and credits "found" only when the
 * player played that exact move with a best-or-better classification.
 *
 * The opportunity's own quality is only known precisely when the player
 * actually played it (reusing that move's already-computed classification,
 * which can be `'brilliant'`); otherwise it's treated as a plain `'best'`
 * for motif-classification purposes, since determining whether an *unplayed*
 * candidate is genuinely brilliant needs the narrow extra engine call
 * (Phase 14.3) this pipeline deliberately reserves for played-move
 * candidates only — a real but accepted undercount of missed brilliancies.
 */
export function computeTacticMotifCounts(colourMoves: ClassifiedMoveDto[], evals: EngineEval[]): TacticMotifCounts {
  const counts = emptyCounts();

  for (const move of colourMoves) {
    const bestMoveSan = evals[move.ply - 1]?.lines[0]?.moveSan;
    if (!move.fenBefore || !bestMoveSan) continue;

    const playedBest = bestMoveSan === move.moveSan;
    const bestQuality: MoveQuality = playedBest ? move.quality : 'best';
    const bestIsCheckmate = playedBest ? (move.moveFlags?.isCheckmate ?? false) : checkmateFlag(move.fenBefore, bestMoveSan);
    if (bestIsCheckmate === null) continue;

    const motif = classifyTacticMotif({
      fenBefore: move.fenBefore,
      moveSan: bestMoveSan,
      mover: move.mover,
      quality: bestQuality,
      isCheckmate: bestIsCheckmate,
      isTacticalPosition: move.isTacticalPosition === true
    });
    if (!motif) continue;

    counts[motif].opportunities += 1;
    if (playedBest && BEST_OR_BETTER.has(move.quality)) counts[motif].found += 1;
  }
  return counts;
}

function checkmateFlag(fenBefore: string, moveSan: string): boolean | null {
  try {
    return moveFlags(fenBefore, moveSan).isCheckmate;
  } catch {
    return null;
  }
}
