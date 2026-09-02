import type {
  AlternativeMove,
  ChecksCapturesThreats,
  ClassifiedMoveDto,
  FeatureDeltaDto,
  MoveQuality,
  PositionFeatures
} from '@freechesscoach/shared';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import type { PgnMoveComment } from '../pgn-move-comments.js';

/**
 * Everything a registry detector (Task 53.3+) might need, built once per ply
 * from the already-stored `ClassifiedMoveDto` — no new engine calls. The one
 * thing not already sitting on the move is the opponent's CCT scan: the
 * stored `checksCapturesThreats` is the *mover's* pre-move scan (what they
 * had to find), so the opponent's post-move scan is computed fresh here from
 * `fenAfter`, which is a pure position analysis, not an engine call.
 */
export interface PlyDiagnosticContext {
  ply: number;
  moveNumber?: number;
  moveSan: string;
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  quality: MoveQuality;
  cpLoss: number;
  isTacticalPosition?: boolean;
  bestMoveSan?: string;
  bestLinePvSan?: string[];
  alternatives?: AlternativeMove[];
  features?: PositionFeatures;
  featureDelta?: FeatureDeltaDto;
  /** The mover's own pre-move CCT scan (§II.D's "what was available to
   * find"), read straight off the stored move. */
  checksCapturesThreats?: ChecksCapturesThreats;
  /** The opponent's CCT scan on `fenAfter` (§II.D's "what was left standing
   * for the opponent to answer") — always computed, never read off the
   * stored move, since no such field exists there. */
  opponentChecksCapturesThreats: ChecksCapturesThreats;
  tacticOpportunity?: ClassifiedMoveDto['tacticOpportunity'];
  tacticPrevention?: ClassifiedMoveDto['tacticPrevention'];
  /** This ply's `[%clk]`/think-time reading, when the source PGN carried one
   * (see `pgn-move-comments.ts`) — sparse, so undefined rather than guessed
   * when the game has no clock data for this ply. */
  moveTime?: PgnMoveComment;
}

/**
 * Returns `null` when the move lacks `fenBefore`/`fenAfter` — both are
 * optional on `ClassifiedMoveSchema` only for legacy stored-analysis
 * compatibility (see its doc comment); every move classified through the
 * current `classify.ts` pipeline has both, and a detector cannot operate
 * without them.
 */
export function buildPlyDiagnosticContext(
  move: ClassifiedMoveDto,
  moveTimes: readonly PgnMoveComment[] = []
): PlyDiagnosticContext | null {
  if (!move.fenBefore || !move.fenAfter) return null;

  return {
    ply: move.ply,
    moveNumber: move.moveNumber,
    moveSan: move.moveSan,
    mover: move.mover,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    quality: move.quality,
    cpLoss: move.cpLoss,
    isTacticalPosition: move.isTacticalPosition,
    bestMoveSan: move.bestMoveSan,
    bestLinePvSan: move.bestLinePvSan,
    alternatives: move.alternatives,
    features: move.features,
    featureDelta: move.featureDelta,
    checksCapturesThreats: move.checksCapturesThreats,
    opponentChecksCapturesThreats: analyzeChecksCapturesThreats(move.fenAfter),
    tacticOpportunity: move.tacticOpportunity,
    tacticPrevention: move.tacticPrevention,
    moveTime: moveTimes.find((entry) => entry.ply === move.ply)
  };
}
