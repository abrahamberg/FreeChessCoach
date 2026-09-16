import type {
  AlternativeMove,
  ChecksCapturesThreats,
  ClassifiedMoveDto,
  FeatureDeltaDto,
  MoveQuality,
  PositionFeatures,
  TacticMotifType
} from '@freechesscoach/shared';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import type { TacticMotifRankHit } from '../game-tactic-motifs.js';
import type { PgnMoveComment } from '../pgn-move-comments.js';

/**
 * Mirrors `apps/api/src/services/tactic-prevention.ts`'s
 * `TacticMotifPreventionResult['diagnosticByPly']` entry shape. Redeclared
 * here rather than imported — that module is a service (engine access,
 * batch/game-scoped), and `packages/chess-analysis` cannot depend on
 * `apps/api` (AGENTS.md layering). The service computes it once per game and
 * the caller resolves this ply's entry before calling
 * `buildPlyDiagnosticContext`, same pattern as `previousMove`/`nextMoves`.
 */
export interface TacticDiagnosticEntry {
  type: TacticMotifType;
  failed: boolean;
  detail: string | null;
}

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
  /** Win% drop for this move (0–100) — the hWDL proxy every failing
   * observation's `hwdl` derives from until Phase 54 computes it properly. */
  drop?: number;
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
  /** The immediately preceding ply (the opponent's move that led into
   * `fenBefore`), when the caller is iterating a full game — MS-07/TA-27's
   * recapture check needs to know what square the opponent just captured
   * on. Undefined for the game's first ply, or when the caller only has
   * this one move in hand. */
  previousMove?: ClassifiedMoveDto;
  /** Up to the next two plies, when known — MS-14's "punished within 2
   * plies" check needs to look forward from this ply. Undefined for the
   * same reasons as `previousMove`. */
  nextMoves?: readonly ClassifiedMoveDto[];
  /** §4.4's unbiased defensive-direction source (Task 50.4's
   * `diagnosticByPly`, resolved to this ply by the caller) — the opponent
   * motif reachable before this move, and whether the mover's move defused
   * it, independent of `ClassifiedMoveDto.tacticPrevention`'s
   * BEST_OR_BETTER skip (see that field's and `diagnosticByPly`'s doc
   * comments for why the two must stay separate). `TA-*` direction-`D`
   * detectors read this, not `tacticPrevention`. */
  tacticDiagnostic?: TacticDiagnosticEntry;
  /** This ply's `computeTacticMotifRankHits` entries (Task 53.5), resolved
   * by the caller from the whole-game call — the direction-`O` `TA-*`
   * detectors' §4.5 "found it at rank N" signal. Undefined when the caller
   * didn't run that scan. */
  tacticRankHits?: readonly TacticMotifRankHit[];
}

export interface BuildPlyDiagnosticContextOptions {
  moveTimes?: readonly PgnMoveComment[];
  previousMove?: ClassifiedMoveDto;
  nextMoves?: readonly ClassifiedMoveDto[];
  tacticDiagnostic?: TacticDiagnosticEntry;
  tacticRankHits?: readonly TacticMotifRankHit[];
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
  options: BuildPlyDiagnosticContextOptions = {}
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
    drop: move.drop,
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
    moveTime: (options.moveTimes ?? []).find((entry) => entry.ply === move.ply),
    previousMove: options.previousMove,
    nextMoves: options.nextMoves,
    tacticDiagnostic: options.tacticDiagnostic,
    tacticRankHits: options.tacticRankHits
  };
}
