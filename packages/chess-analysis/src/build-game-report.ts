import {
  MOVE_QUALITIES,
  type BookReport,
  type ClassificationCounts,
  type ClassifiedMoveDto,
  type EngineEval,
  type EstimatedRatingReport,
  type GameReport,
  type MovePhase,
  type PhaseConfidence,
  type PlayerReport
} from '@freechesscoach/shared';
import type { ParsedGame } from './pgn.js';
import {
  endgameStartPly as resolveEndgameStartPly,
  isLowConfidencePhase,
  openingEndPly as resolveOpeningEndPly,
  phaseForPly,
  type PhaseBoundaries,
  type PhasePosition
} from './phase-segmentation.js';
import { accuracyForAggregate, aggregateAccuracy, volatilityWeights } from './game-accuracy.js';
import { phaseAccuracy, type PhaseAccuracyMove } from './phase-accuracy.js';
import { bookDepthScore, developmentScore, openingScore, positionAtOrBefore } from './opening-score.js';
import { isTacticalPosition, tacticsScore, type TacticsEvidenceMove } from './tactics-score.js';
import {
  attackingTrend,
  filesTrend,
  kingSafetyTrend,
  pawnStructureTrend,
  positionalTrend,
  spaceTrend,
  strategyScore,
  type PositionalTrendInput
} from './strategy-score.js';
import { endgameScore, endgameStandingBucket, type GameResultForColour } from './endgame-score.js';
import { classifyEndgameType } from './endgame-theme.js';
import {
  accuracyToElo,
  combinedRawRating,
  complexity,
  errorRating,
  estimateRating,
  movesPlayedExcludingForcedSequences
} from './rating-estimate.js';
import { computePositionFeatures } from './position-features.js';
import { toCpWhite, winPctFor, winPctWhite } from './win-probability.js';
import { computeTacticMotifCounts } from './game-tactic-motifs.js';
import { CONFIG } from './config.js';

type Colour = 'white' | 'black';
const EMPTY_SCORE = { cp: null, mateIn: null } as const;

export interface BuildGameReportInput {
  game: ParsedGame;
  /** Indexed by position — `evals[i]` is the evaluation of `game.positions[i]`. */
  evals: EngineEval[];
  /** The output of `classifyMoves` — `phase`/`isTacticalPosition` are filled
   * in here, since they depend on the phase boundaries this function resolves. */
  moves: ClassifiedMoveDto[];
  book: BookReport;
  engine: { name: string; depth: number; multiPv: number };
  priorRating: Record<Colour, number | null>;
  result: Record<Colour, GameResultForColour>;
}

interface GameContext {
  game: ParsedGame;
  evals: EngineEval[];
  book: BookReport;
  boundaries: PhaseBoundaries;
  /** White-POV win% at every position — the shared series both colours'
   * volatility weights are drawn from (§4.1). */
  winPctSeriesWhite: number[];
}

/**
 * §9's final assembly step: resolves phase boundaries (§6), fills in each
 * move's `phase`/`isTacticalPosition` (§6, §7.2), then builds both players'
 * accuracy/scores/counts/rating. Everything upstream of this (engine evals,
 * per-move classification) is assumed already computed.
 */
export function buildGameReport(input: BuildGameReportInput): GameReport {
  const boundaries = resolvePhaseBoundaries(input.game, input.book);
  const moves = input.moves.map((move) => enrichWithPhaseAndTactics(move, boundaries, input.evals));
  const context: GameContext = {
    game: input.game,
    evals: input.evals,
    book: input.book,
    boundaries,
    winPctSeriesWhite: input.evals.map((evalResult) => winPctWhite(toCpWhite(evalResult.lines[0] ?? EMPTY_SCORE)))
  };

  return {
    engine: input.engine,
    book: input.book,
    // The book index is a bundled asset always present in this deployment —
    // 'heuristic' is reserved for a deployment with no book index at all
    // (§6.1), which never happens here, so this is never the fallback branch.
    phases: { ...boundaries, openingSource: 'book' },
    players: {
      white: buildPlayerReport('white', moves, context, input.priorRating.white, input.result.white),
      black: buildPlayerReport('black', moves, context, input.priorRating.black, input.result.black)
    },
    moves
  };
}

function resolvePhaseBoundaries(game: ParsedGame, book: BookReport): PhaseBoundaries {
  const openingEndPlyValue = resolveOpeningEndPly(book.lastBookPly);
  const positions: PhasePosition[] = game.positions.map((position) => ({ ply: position.ply, fen: position.fen }));
  return { openingEndPly: openingEndPlyValue, endgameStartPly: resolveEndgameStartPly(positions, openingEndPlyValue) };
}

function enrichWithPhaseAndTactics(
  move: ClassifiedMoveDto,
  boundaries: PhaseBoundaries,
  evals: EngineEval[]
): ClassifiedMoveDto {
  const phase: MovePhase = phaseForPly(move.ply, boundaries);
  return { ...move, phase, isTacticalPosition: computeIsTacticalPosition(move, evals) };
}

function computeIsTacticalPosition(move: ClassifiedMoveDto, evals: EngineEval[]): boolean {
  const evalBefore = evals[move.ply - 1];
  if (!move.fenBefore || !evalBefore) return false;
  return isTacticalPosition({
    mover: move.mover,
    fenBefore: move.fenBefore,
    evalBefore,
    features: computePositionFeatures(move.fenBefore)
  });
}

function buildPlayerReport(
  colour: Colour,
  moves: ClassifiedMoveDto[],
  context: GameContext,
  prior: number | null,
  result: GameResultForColour
): PlayerReport {
  const colourMoves = moves.filter((move) => move.mover === colour);
  const weights = volatilityWeights(context.winPctSeriesWhite, colourMoves.map((move) => move.ply));
  const fullGameWeights = new Map<number, number>(colourMoves.map((move, index) => [move.ply, weights[index] ?? 0]));

  const accuracy = filteredAccuracy(colourMoves, fullGameWeights) ?? 0;
  const phaseAccuracyMoves = moves.map(toPhaseAccuracyMove);
  const phaseAccuracyByPhase = {
    opening: phaseAccuracy(colour, 'opening', phaseAccuracyMoves, fullGameWeights),
    middlegame: phaseAccuracy(colour, 'middlegame', phaseAccuracyMoves, fullGameWeights),
    endgame: phaseAccuracy(colour, 'endgame', phaseAccuracyMoves, fullGameWeights)
  };
  const counts = classificationCounts(colourMoves);
  const strategyScores = buildStrategyScores(colour, colourMoves, context, fullGameWeights);

  return {
    accuracy: round1(accuracy),
    phaseAccuracy: phaseAccuracyByPhase,
    phaseConfidence: {
      opening: phaseConfidenceFor(phaseAccuracyByPhase.opening, countInPhase(phaseAccuracyMoves, colour, 'opening')),
      middlegame: phaseConfidenceFor(phaseAccuracyByPhase.middlegame, countInPhase(phaseAccuracyMoves, colour, 'middlegame')),
      endgame: phaseConfidenceFor(phaseAccuracyByPhase.endgame, countInPhase(phaseAccuracyMoves, colour, 'endgame'))
    },
    scores: {
      opening: buildOpeningScore(colour, phaseAccuracyByPhase.opening, context),
      tactics: tacticsScore(toTacticsMoves(colourMoves), tacticalAccuracy(colourMoves, fullGameWeights)).score,
      strategy: strategyScores.overall,
      endgame: endgameScore(phaseAccuracyByPhase.endgame, winPctAtEndgameStart(colour, context), result)
    },
    strategySubScores: strategyScores.subScores,
    endgame: buildEndgameContext(colour, context),
    counts,
    acpl: round1(mean(colourMoves.map((move) => move.cpLoss))),
    estimatedRating: buildEstimatedRating(colourMoves, weights, accuracy, counts, prior),
    tacticMotifs: computeTacticMotifCounts(colourMoves, context.evals)
  };
}

function toPhaseAccuracyMove(move: ClassifiedMoveDto): PhaseAccuracyMove {
  return { ply: move.ply, mover: move.mover, quality: move.quality, drop: move.drop ?? 0, phase: move.phase ?? 'middlegame' };
}

function countInPhase(moves: PhaseAccuracyMove[], colour: Colour, phase: MovePhase): number {
  return moves.filter((move) => move.mover === colour && move.phase === phase).length;
}

function phaseConfidenceFor(accuracy: number | null, moveCount: number): PhaseConfidence {
  if (accuracy === null) return 'none';
  return isLowConfidencePhase(moveCount) ? 'low' : 'ok';
}

function filteredAccuracy(moves: ClassifiedMoveDto[], fullGameWeights: ReadonlyMap<number, number>): number | null {
  const accs = moves.map((move) => accuracyForAggregate(move.quality, move.drop ?? 0));
  const weights = moves.map((move) => fullGameWeights.get(move.ply) ?? 0);
  return aggregateAccuracy(accs, weights);
}

function tacticalAccuracy(colourMoves: ClassifiedMoveDto[], fullGameWeights: ReadonlyMap<number, number>): number | null {
  return filteredAccuracy(colourMoves.filter((move) => move.isTacticalPosition === true), fullGameWeights);
}

function quietAccuracy(colourMoves: ClassifiedMoveDto[], fullGameWeights: ReadonlyMap<number, number>): number | null {
  return filteredAccuracy(colourMoves.filter((move) => move.isTacticalPosition !== true), fullGameWeights);
}

function toTacticsMoves(colourMoves: ClassifiedMoveDto[]): TacticsEvidenceMove[] {
  return colourMoves.map((move) => ({
    mover: move.mover,
    quality: move.quality,
    fenAfter: move.fenAfter ?? '',
    featureDelta: move.featureDelta ?? { newForks: [], newHangingPieces: [], mobilityDelta: 0 },
    isTacticalPosition: move.isTacticalPosition === true
  }));
}

function buildOpeningScore(colour: Colour, openingAccuracy: number | null, context: GameContext): number | null {
  return openingScore({
    openingAccuracy,
    bookDepthScore: bookDepthScore(context.book.players[colour].lastBookPly),
    developmentScore: developmentScore({
      positions: context.game.positions,
      color: colour,
      openingEndPly: context.boundaries.openingEndPly
    })
  });
}

interface StrategyScores {
  overall: number | null;
  subScores: PlayerReport['strategySubScores'];
}

const NULL_STRATEGY_SUB_SCORES: PlayerReport['strategySubScores'] = {
  pawnStructure: null,
  spaceAdvantage: null,
  activePiece: null,
  attacking: null,
  defending: null
};

/**
 * §7.3's overall score plus, individually, the five named components it
 * sums internally (Phase 25) — surfaced for the stats dashboard's Strategy
 * breakdown. Every sub-score reuses `strategyScore`'s own
 * `clamp(quietAccuracy + component, 0, 100)` formula and null guard, just
 * fed one component at a time instead of their sum.
 */
function buildStrategyScores(
  colour: Colour,
  colourMoves: ClassifiedMoveDto[],
  context: GameContext,
  fullGameWeights: ReadonlyMap<number, number>
): StrategyScores {
  const quietMoves = colourMoves.filter((move) => move.isTacticalPosition !== true);
  const finalPosition = context.game.positions[context.game.positions.length - 1];
  if (!finalPosition) return { overall: null, subScores: NULL_STRATEGY_SUB_SCORES };
  const openingEndPosition = positionAtOrBefore(context.game.positions, context.boundaries.openingEndPly);

  const trendInput: PositionalTrendInput = {
    color: colour,
    fenAtOpeningEnd: openingEndPosition.fen,
    featuresAtOpeningEnd: computePositionFeatures(openingEndPosition.fen),
    fenAtFinal: finalPosition.fen,
    featuresAtFinal: computePositionFeatures(finalPosition.fen),
    quietMoveMobilityDeltas: quietMoves.map((move) => move.featureDelta?.mobilityDelta ?? 0)
  };
  const trend = positionalTrend(trendInput);
  const quietAcc = quietAccuracy(colourMoves, fullGameWeights);
  const scoreFor = (component: number): number | null => strategyScore(quietMoves.length, quietAcc, component).score;

  return {
    overall: strategyScore(quietMoves.length, quietAcc, trend).score,
    subScores: {
      pawnStructure: scoreFor(pawnStructureTrend(trendInput)),
      spaceAdvantage: scoreFor(spaceTrend(trendInput.quietMoveMobilityDeltas)),
      activePiece: scoreFor(filesTrend(trendInput)),
      attacking: scoreFor(attackingTrend(trendInput)),
      defending: scoreFor(kingSafetyTrend(trendInput))
    }
  };
}

function winPctAtEndgameStart(colour: Colour, context: GameContext): number | null {
  if (context.boundaries.endgameStartPly === null) return null;
  const evalAtStart = context.evals[context.boundaries.endgameStartPly];
  if (!evalAtStart) return null;
  return winPctFor(colour, toCpWhite(evalAtStart.lines[0] ?? EMPTY_SCORE));
}

/** Phase 26: the standing/theme buckets the stats dashboard groups games by
 * — null/null whenever the game never reached the endgame for this colour
 * (the same `endgameStartPly === null` signal `scores.endgame` already uses). */
function buildEndgameContext(colour: Colour, context: GameContext): PlayerReport['endgame'] {
  const ply = context.boundaries.endgameStartPly;
  const position = ply === null ? undefined : context.game.positions[ply];
  const winPct = winPctAtEndgameStart(colour, context);
  if (!position || winPct === null) return { standing: null, theme: null };
  return { standing: endgameStandingBucket(winPct), theme: classifyEndgameType(position.fen) };
}

function classificationCounts(colourMoves: ClassifiedMoveDto[]): ClassificationCounts {
  const counts = Object.fromEntries(MOVE_QUALITIES.map((quality) => [quality, 0])) as unknown as ClassificationCounts;
  for (const move of colourMoves) counts[move.quality] += 1;
  return counts;
}

function buildEstimatedRating(
  colourMoves: ClassifiedMoveDto[],
  weights: number[],
  accuracy: number,
  counts: ClassificationCounts,
  prior: number | null
): EstimatedRatingReport {
  const movesPlayed = movesPlayedExcludingForcedSequences(colourMoves.map((move) => move.quality));
  const accuracyRating = accuracyToElo(accuracy);
  const errorRatingValue = errorRating(
    { inaccuracy: counts.inaccuracy, mistake: counts.mistake, blunder: counts.blunder, miss: counts.miss },
    movesPlayed
  );
  const raw = combinedRawRating(accuracyRating, errorRatingValue);
  const complexityValue = complexity(mean(weights));
  const estimate = estimateRating({ raw, complexity: complexityValue, movesPlayed, prior });

  if (estimate.value === null) {
    return { value: null, range: null, confidence: 'low', reason: estimate.reason };
  }
  return {
    value: estimate.value,
    range: estimate.range,
    confidence: movesPlayed >= CONFIG.ratingEstimate.mediumConfidenceMinMoves ? 'medium' : 'low'
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
