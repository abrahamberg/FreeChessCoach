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
import { playedMoveGap, type EvalGap } from '../eval-witness.js';
import { featuresBeforeOf } from '../features-before.js';
import type { TacticMotifRankHit } from '../game-tactic-motifs.js';
import type { PgnMoveComment } from '../pgn-move-comments.js';

/**
 * The opponent tactic a move allowed (`failed`) or defused (not failed) —
 * built by the caller from the move's verdict (`move-verdict/`,
 * `apps/api/src/services/build-diagnostics.ts`, Task 77.5), the same way it
 * resolves `previousMove`/`nextMoves`. It used to mirror the prevention
 * pass's `diagnosticByPly`, which the single-verdict pass retired.
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
 * had to find), so the opponent's post-move scan comes from the next ply's
 * stored scan, or is computed here from `fenAfter` (a pure position
 * analysis, not an engine call).
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
  /** Best line's eval at `fenBefore` and the played move's eval, both
   * White-perspective and clamped as stored (`ClassifiedMoveDto`). */
  cpBefore?: number;
  cpAfter?: number;
  /** Mover-perspective win% of the best line and of the played move —
   * DQ-09's "completely decided" check reads these. */
  winPctBefore?: number;
  winPctAfter?: number;
  /** Best line against the played move (`playedMoveGap`) — the eval witness
   * every loss verdict consults. `null` on a legacy move without evals. */
  playedGap: EvalGap | null;
  /** The engine's best reply to the played move: the next ply's
   * `bestLinePvSan`. Undefined when the next ply is not known (the live
   * path, or the last move of a game). */
  refutationPvSan?: string[];
  isTacticalPosition?: boolean;
  bestMoveSan?: string;
  bestLinePvSan?: string[];
  alternatives?: AlternativeMove[];
  features?: PositionFeatures;
  /** The position features of `fenBefore`: `previousMove.features` when that
   * move ended on `fenBefore`, computed otherwise (Task 77.3). */
  featuresBefore: PositionFeatures;
  featureDelta?: FeatureDeltaDto;
  /** The mover's own pre-move CCT scan (§II.D's "what was available to
   * find"), read straight off the stored move. */
  checksCapturesThreats?: ChecksCapturesThreats;
  /** The opponent's CCT scan on `fenAfter` (§II.D's "what was left standing
   * for the opponent to answer"): the next ply's own stored
   * `checksCapturesThreats` (the same scan of the same position) when the
   * caller passed that ply, computed otherwise (Task 77.3). */
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
  /** The verdict's allowed or defused opponent tactic, resolved to this ply
   * by the caller (see `TacticDiagnosticEntry`). `TA-*` direction-`D`
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
    cpBefore: move.cpBefore,
    cpAfter: move.cpAfter,
    winPctBefore: move.winPctBefore,
    winPctAfter: move.winPctAfter,
    playedGap: playedMoveGap(move),
    refutationPvSan: refutationFor(move, options.nextMoves),
    isTacticalPosition: move.isTacticalPosition,
    bestMoveSan: move.bestMoveSan,
    bestLinePvSan: move.bestLinePvSan,
    alternatives: move.alternatives,
    features: move.features,
    featuresBefore: featuresBeforeOf(move.fenBefore, options.previousMove),
    featureDelta: move.featureDelta,
    checksCapturesThreats: move.checksCapturesThreats,
    opponentChecksCapturesThreats: opponentScanFor(move.fenAfter, move.ply, options.nextMoves),
    tacticOpportunity: move.tacticOpportunity,
    tacticPrevention: move.tacticPrevention,
    moveTime: (options.moveTimes ?? []).find((entry) => entry.ply === move.ply),
    previousMove: options.previousMove,
    nextMoves: options.nextMoves,
    tacticDiagnostic: options.tacticDiagnostic,
    tacticRankHits: options.tacticRankHits
  };
}

/**
 * The next ply's stored pre-move scan is `analyzeChecksCapturesThreats` of
 * its `fenBefore` (`classify.ts`, with that position's own features, which is
 * what the scan computes without them), so when that `fenBefore` is this
 * move's `fenAfter` it is exactly the scan this context needs.
 */
function opponentScanFor(fenAfter: string, ply: number, nextMoves: readonly ClassifiedMoveDto[] | undefined): ChecksCapturesThreats {
  const reply = nextMoves?.[0];
  const isSamePosition = reply?.ply === ply + 1 && reply.fenBefore === fenAfter;
  return (isSamePosition ? reply.checksCapturesThreats : undefined) ?? analyzeChecksCapturesThreats(fenAfter);
}

function refutationFor(move: ClassifiedMoveDto, nextMoves: readonly ClassifiedMoveDto[] | undefined): string[] | undefined {
  const reply = nextMoves?.[0];
  return reply?.ply === move.ply + 1 ? reply.bestLinePvSan : undefined;
}
