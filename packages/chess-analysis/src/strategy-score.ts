import { Chess, type Square } from 'chess.js';
import type { PositionFeatures } from '@freechesscoach/shared';
import { buildAttackMap, type ColorName } from './attack-map.js';
import { CONFIG } from './config.js';

const {
  minQuietPositions: MIN_QUIET_POSITIONS,
  trendClamp: TREND_CLAMP,
  doubledPawnWeight: DOUBLED_PAWN_WEIGHT,
  isolatedPawnWeight: ISOLATED_PAWN_WEIGHT,
  passedPawnWeight: PASSED_PAWN_WEIGHT,
  spaceWeight: SPACE_WEIGHT,
  openFileWeight: OPEN_FILE_WEIGHT,
  centerWeight: CENTER_WEIGHT,
  kingSafetyPenalty: KING_SAFETY_PENALTY,
  kingSafetyAttackerThreshold: KING_SAFETY_ATTACKER_THRESHOLD
} = CONFIG.strategyScore;

export interface PositionalTrendInput {
  color: ColorName;
  fenAtOpeningEnd: string;
  featuresAtOpeningEnd: PositionFeatures;
  fenAtFinal: string;
  featuresAtFinal: PositionFeatures;
  /** `mobilityDelta` for each of the colour's moves in non-tactical (quiet)
   * positions — the "space" component's mean. */
  quietMoveMobilityDeltas: number[];
}

/**
 * §7.3's positionalTrend: the change in the mover's structural standing
 * between the opening boundary and the final (or last-quiet) position,
 * clamped to [-15, +15].
 */
export function positionalTrend(input: PositionalTrendInput): number {
  const sum =
    pawnStructureTrend(input) +
    spaceTrend(input.quietMoveMobilityDeltas) +
    filesTrend(input) +
    centreTrend(input) +
    kingSafetyTrend(input);

  return clamp(sum, -TREND_CLAMP, TREND_CLAMP);
}

function pawnStructureTrend(input: PositionalTrendInput): number {
  const before = pawnStructureCounts(input.featuresAtOpeningEnd, input.color);
  const after = pawnStructureCounts(input.featuresAtFinal, input.color);
  return (
    DOUBLED_PAWN_WEIGHT * (after.doubled - before.doubled) +
    ISOLATED_PAWN_WEIGHT * (after.isolated - before.isolated) +
    PASSED_PAWN_WEIGHT * (after.passed - before.passed)
  );
}

function pawnStructureCounts(
  features: PositionFeatures,
  color: ColorName
): { doubled: number; isolated: number; passed: number } {
  return {
    doubled: features.doubledPawns.filter((entry) => entry.color === color).length,
    isolated: features.isolatedPawns.filter((entry) => entry.color === color).length,
    passed: features.passedPawns.filter((entry) => entry.color === color).length
  };
}

function spaceTrend(quietMoveMobilityDeltas: number[]): number {
  if (quietMoveMobilityDeltas.length === 0) return 0;
  const mean = quietMoveMobilityDeltas.reduce((total, delta) => total + delta, 0) / quietMoveMobilityDeltas.length;
  return SPACE_WEIGHT * mean;
}

function filesTrend(input: PositionalTrendInput): number {
  const before = majorPiecesOnOpenFiles(input.featuresAtOpeningEnd, input.color);
  const after = majorPiecesOnOpenFiles(input.featuresAtFinal, input.color);
  return OPEN_FILE_WEIGHT * (after - before);
}

function majorPiecesOnOpenFiles(features: PositionFeatures, color: ColorName): number {
  const openFiles = new Set(features.openFiles);
  const semiOpenForColor = new Set(
    features.semiOpenFiles.filter((entry) => entry.openFor === color).map((entry) => entry.file)
  );

  return features.controlledSquares.filter((piece) => {
    if (piece.color !== color || (piece.piece !== 'r' && piece.piece !== 'q')) return false;
    const file = piece.square[0] ?? '';
    return openFiles.has(file) || semiOpenForColor.has(file);
  }).length;
}

function centreTrend(input: PositionalTrendInput): number {
  const opponent = opponentOf(input.color);
  const before = input.featuresAtOpeningEnd.centerControlScore;
  const after = input.featuresAtFinal.centerControlScore;
  const beforeAdvantage = before[input.color] - before[opponent];
  const afterAdvantage = after[input.color] - after[opponent];
  return CENTER_WEIGHT * (afterAdvantage - beforeAdvantage);
}

function kingSafetyTrend(input: PositionalTrendInput): number {
  const before = kingSafetySignals(input.fenAtOpeningEnd, input.color);
  const after = kingSafetySignals(input.fenAtFinal, input.color);
  const escapeSquaresTrendingDown = after.escapeSquareCount < before.escapeSquareCount;
  return escapeSquaresTrendingDown && after.opponentAttackerCount >= KING_SAFETY_ATTACKER_THRESHOLD
    ? KING_SAFETY_PENALTY
    : 0;
}

interface KingSafetySignals {
  escapeSquareCount: number;
  opponentAttackerCount: number;
}

/** Escape squares (empty, unattacked) and opponent attacker pressure on the
 * squares immediately around the king — not itself a PositionFeatures field,
 * so recomputed from the FEN via the same pure attack-map machinery the
 * feature bag is built from. */
function kingSafetySignals(fen: string, color: ColorName): KingSafetySignals {
  const chess = new Chess(fen);
  const attackMap = buildAttackMap(chess);
  const kingSquare = findKingSquare(chess, color);
  if (!kingSquare) return { escapeSquareCount: 0, opponentAttackerCount: 0 };

  const opponentColorName = opponentOf(color);
  let escapeSquareCount = 0;
  let opponentAttackerCount = 0;

  for (const square of adjacentSquares(kingSquare)) {
    const occupant = chess.get(square);
    const attackers = attackMap.attackersOf.get(square)?.[opponentColorName].length ?? 0;
    if (!occupant && attackers === 0) escapeSquareCount += 1;
    opponentAttackerCount += attackers;
  }

  return { escapeSquareCount, opponentAttackerCount };
}

function findKingSquare(chess: Chess, color: ColorName): Square | null {
  const chessColor = color === 'white' ? 'w' : 'b';
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === chessColor) return piece.square;
    }
  }
  return null;
}

const FILES = 'abcdefgh';

function adjacentSquares(square: Square): Square[] {
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number(square[1]);
  const squares: Square[] = [];
  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) continue;
      const targetFile = file + fileOffset;
      const targetRank = rank + rankOffset;
      if (targetFile < 0 || targetFile > 7 || targetRank < 1 || targetRank > 8) continue;
      squares.push(`${FILES[targetFile]}${targetRank}` as Square);
    }
  }
  return squares;
}

function opponentOf(color: ColorName): ColorName {
  return color === 'white' ? 'black' : 'white';
}

export interface StrategyScoreResult {
  score: number | null;
  reason?: 'insufficient quiet positions';
}

/**
 * §7.3's final score: `quietAccuracy` (the §4 aggregate machinery restricted
 * to non-tactical-position moves, computed by the caller) plus the already-
 * clamped positional trend. `null` with a reason when fewer than 4 quiet
 * positions were seen for this colour — the same guard as tactics.
 */
export function strategyScore(
  quietPositionCount: number,
  quietAccuracy: number | null,
  trend: number
): StrategyScoreResult {
  if (quietPositionCount < MIN_QUIET_POSITIONS || quietAccuracy === null) {
    return { score: null, reason: 'insufficient quiet positions' };
  }
  return { score: clamp(quietAccuracy + trend, 0, 100) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
