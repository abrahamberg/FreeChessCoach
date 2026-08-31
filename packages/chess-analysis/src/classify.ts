import { Chess, type PieceSymbol } from 'chess.js';
import type {
  ClassifiedMoveDto,
  EngineEval,
  EngineLine,
  FeatureDeltaDto,
  MoveQuality,
  PositionFeatures
} from '@freechesscoach/shared';
import { computeMoveDrop } from './move-metrics.js';
import { enrichPositions } from './position-enrichment.js';
import { inBookWalk, resolveOpening, type OpeningResolution } from './opening-book.js';
import { positionKey } from './opening-book-key.js';
import { classifyMove, type MoveClassificationInput } from './classify-move.js';
import { buildReasons } from './move-reasons.js';
import { moveFlags } from './move-flags.js';
import { computePositionFeatures } from './position-features.js';
import { moveAccuracy as calculateMoveAccuracy } from './accuracy-curve.js';
import { toCpWhite, winPctFor, winPctWhite } from './win-probability.js';
import { analyzeChecksCapturesThreats } from './checks-captures-threats.js';
import type { ParsedGame } from './pgn.js';

export type ClassifiedMove = ClassifiedMoveDto;

export interface ClassifyMovesOptions {
  /** Results of the API-layer B6 engine check, keyed by move ply. */
  brilliantSoundnessByPly?: ReadonlyMap<number, boolean>;
}

/** Classifies every move through the report's decision order. */
export function classifyMoves(
  game: ParsedGame,
  evals: EngineEval[],
  userColor: 'white' | 'black',
  options: ClassifyMovesOptions = {}
): ClassifiedMove[] {
  const enrichment = enrichPositions(game.positions);
  const bookWalk = inBookWalk(game.positions);
  const opening = resolveOpening(game.positions.map((position) => positionKey(position.fen)));

  return game.positions.slice(1).map((position, index) => {
    const before = game.positions[index];
    if (!before) throw new Error(`Missing position before ply ${position.ply}`);
    const currentEval = evalAt(evals[index], before.fen);
    const nextEval = evalAt(evals[index + 1], position.fen);
    const positionEnrichment = enrichment[position.ply];
    const beforeEnrichment = enrichment[index];
    if (!positionEnrichment?.moveFlags || !positionEnrichment.featureDelta) {
      throw new Error(`Missing move enrichment for ply ${position.ply}`);
    }

    return buildClassifiedMove({
      position,
      beforeFen: before.fen,
      evalBefore: currentEval,
      evalAfter: nextEval,
      userColor,
      moveFlags: positionEnrichment.moveFlags,
      features: positionEnrichment.features,
      featuresBefore: beforeEnrichment?.features,
      featureDelta: positionEnrichment.featureDelta,
      isBookMove: bookWalk[index]?.classification === 'book',
      opening,
      brilliantSoundness: options.brilliantSoundnessByPly?.get(position.ply),
      isRecapture: isRecapture(game.positions[index - 1], before, position)
    });
  });
}

/** Classifies one live move using the same orchestrator as batch analysis. */
export function classifyLiveMove(input: {
  ply: number;
  moveSan: string;
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter?: string;
  evalBefore: EngineEval | undefined;
  evalAfter: EngineEval | undefined;
  userColor: 'white' | 'black';
  brilliantSoundness?: boolean;
}): ClassifiedMove {
  const chess = new Chess(input.fenBefore);
  const applied = chess.move(input.moveSan);
  const fenAfter = input.fenAfter ?? chess.fen();
  const currentEval = evalAt(input.evalBefore, input.fenBefore);
  const nextEval = evalAt(input.evalAfter, fenAfter);
  const flags = moveFlags(input.fenBefore, input.moveSan);
  const featuresBefore = computePositionFeatures(input.fenBefore);
  const featuresAfter = computePositionFeatures(fenAfter);

  return buildClassifiedMove({
    position: {
      ply: input.ply,
      fen: fenAfter,
      moveSan: applied.san,
      moveUci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
      mover: input.mover
    },
    beforeFen: input.fenBefore,
    evalBefore: currentEval,
    evalAfter: nextEval,
    userColor: input.userColor,
    moveFlags: flags,
    features: featuresAfter,
    featuresBefore,
    featureDelta: {
      newForks: featuresAfter.forks,
      newHangingPieces: featuresAfter.hangingPieces,
      mobilityDelta: featuresAfter.availableMoves.length - featuresBefore.availableMoves.length
    },
    isBookMove: false,
    opening: null,
    brilliantSoundness: input.brilliantSoundness,
    isRecapture: false
  });
}

function buildClassifiedMove(input: {
  position: ParsedGame['positions'][number];
  beforeFen: string;
  evalBefore: EngineEval;
  evalAfter: EngineEval;
  userColor: 'white' | 'black';
  moveFlags: ReturnType<typeof moveFlags>;
  features: PositionFeatures;
  featuresBefore?: PositionFeatures;
  featureDelta: FeatureDeltaDto;
  isBookMove: boolean;
  opening: OpeningResolution | null;
  brilliantSoundness: boolean | undefined;
  isRecapture: boolean;
}): ClassifiedMove {
  const mover = input.position.mover ?? 'white';
  const cpBefore = toCpWhite(firstLine(input.evalBefore) ?? EMPTY_SCORE);
  const deliveredMate = input.position.moveSan?.endsWith('#') ?? false;
  const cpAfter = toCpWhite(firstLine(input.evalAfter) ?? EMPTY_SCORE);
  const winPctBefore = winPctFor(mover, cpBefore);
  const winPctAfter = winPctFor(mover, cpAfter);
  const drop = deliveredMate ? 0 : computeMoveDrop(winPctWhite(cpBefore), winPctWhite(cpAfter), mover);
  const bestMoveSan = firstLine(input.evalBefore)?.moveSan ?? '';
  const classificationInput: MoveClassificationInput = {
    ply: input.position.ply,
    moveSan: input.position.moveSan ?? '',
    moveUci: input.position.moveUci ?? '',
    mover,
    fenBefore: input.beforeFen,
    fenAfter: input.position.fen,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    moveFlags: input.moveFlags,
    beforeWin: winPctBefore,
    afterWin: winPctAfter,
    drop,
    cpBefore,
    cpAfter,
    isBookMove: input.isBookMove,
    brilliantSoundness: input.brilliantSoundness,
    bestLinePvSan: bestMoveSan ? [bestMoveSan] : [],
    features: input.features,
    featureDelta: input.featureDelta,
    isRecapture: input.isRecapture
  };
  const result = classifyMove(classificationInput);
  const hangs = input.position.moveSan !== null && hangsPiece(input.beforeFen, input.position.moveSan);
  const reasons = buildReasons({
    mover,
    fenBefore: input.beforeFen,
    fenAfter: input.position.fen,
    moveSan: input.position.moveSan ?? '',
    evalBefore: input.evalBefore,
    isBookMove: input.isBookMove,
    openingName: input.opening?.name,
    eco: input.opening?.eco,
    featureDelta: input.featureDelta,
    featuresBefore: input.featuresBefore,
    featuresAfter: input.features
  });
  const checksCapturesThreats = analyzeChecksCapturesThreats(input.beforeFen, { featuresBefore: input.featuresBefore });

  return {
    ply: input.position.ply,
    moveNumber: Math.ceil(input.position.ply / 2),
    moveSan: input.position.moveSan ?? '',
    uci: input.position.moveUci ?? undefined,
    mover,
    isUserMove: mover === input.userColor,
    cpLoss: cpLoss(classificationInput),
    quality: result.classification,
    underlyingSeverity: result.underlyingSeverity,
    bestLineSan: bestMoveSan ? [bestMoveSan] : [],
    evalAfterCp: cpAfter,
    hangsPiece: hangs,
    fenBefore: input.beforeFen,
    fenAfter: input.position.fen,
    cpBefore,
    cpAfter,
    winPctBefore,
    winPctAfter,
    drop,
    accuracy: calculateMoveAccuracy(drop),
    bestMoveSan,
    bestLinePvSan: bestMoveSan ? [bestMoveSan] : [],
    alternatives: input.evalBefore.lines.slice(1).map((line) => ({
      san: line.moveSan,
      cp: toCpWhite(line),
      winPct: winPctFor(mover, toCpWhite(line))
    })),
    features: input.features,
    moveFlags: input.moveFlags,
    featureDelta: input.featureDelta,
    checksCapturesThreats,
    reasons
  };
}

function cpLoss(input: MoveClassificationInput): number {
  if (input.moveSan.endsWith('#')) return 0;
  const before = moverPerspective(input.cpBefore, input.mover);
  const after = moverPerspective(input.cpAfter, input.mover);
  return Math.min(1000, Math.max(0, Math.round(before - after)));
}

function moverPerspective(cpWhite: number, mover: 'white' | 'black'): number {
  return mover === 'white' ? cpWhite : -cpWhite;
}

function evalAt(value: EngineEval | undefined, fen: string): EngineEval {
  return value ?? { ply: 0, fen, depth: 1, lines: [] };
}

const EMPTY_SCORE = { cp: null, mateIn: null } as const;

function firstLine(engineEval: EngineEval): EngineLine | undefined {
  return engineEval.lines[0];
}

function isRecapture(
  previousBefore: ParsedGame['positions'][number] | undefined,
  previousMove: ParsedGame['positions'][number],
  currentMove: ParsedGame['positions'][number]
): boolean {
  if (!previousBefore || !previousMove.moveSan || !currentMove.moveSan) return false;
  try {
    const previousBoard = new Chess(previousBefore.fen);
    const previous = previousBoard.move(previousMove.moveSan);
    const currentBoard = new Chess(previousMove.fen);
    const current = currentBoard.move(currentMove.moveSan);
    return previous.captured !== undefined && current.captured !== undefined && previous.to === current.to;
  } catch {
    return false;
  }
}

/** Legacy expected-points helper retained for existing consumers. */
export function expectedPoints(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

/** Legacy name for the shared White-perspective score conversion. */
export function whitePerspectiveCp(line: EngineLine | undefined): number {
  return toCpWhite(line ?? EMPTY_SCORE);
}

/** Converts a White-perspective centipawn score to mover perspective. */
export function toMoverPerspective(whiteCp: number, mover: 'white' | 'black'): number {
  return mover === 'white' ? whiteCp : -whiteCp;
}

/** Legacy quality ladder retained as an API compatibility helper. */
export function qualityFor(cpLoss: number, epLoss: number, isSacrifice = false, isMiss = false): MoveQuality {
  if (isMiss && epLoss < 0.2) return 'miss';
  if (epLoss >= 0.3) return 'blunder';
  if (epLoss >= 0.2) return 'mistake';
  if (epLoss >= 0.1) return 'inaccuracy';
  if (epLoss >= 0.05) return 'excellent';
  if (isSacrifice) return 'brilliant';
  return cpLoss === 0 ? 'best' : 'good';
}

/** A move is sound unless it is one of the report's error labels. */
export function isSoundQuality(quality: MoveQuality): boolean {
  return quality !== 'inaccuracy' && quality !== 'mistake' && quality !== 'blunder' && quality !== 'miss';
}

/** Compatibility sacrifice signal; Brilliant classification uses real SEE. */
export function isSacrifice(fenBefore: string, moveSan: string): boolean {
  const chess = new Chess(fenBefore);
  let move;
  try {
    move = chess.move(moveSan);
  } catch {
    return false;
  }
  if (!move || move.captured || move.piece === 'p' || move.piece === 'k') return false;
  const opponentColor = move.color === 'w' ? 'b' : 'w';
  if (!chess.isAttacked(move.to, opponentColor)) return false;
  const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return chess.attackers(move.to, opponentColor).some((square) => {
    const piece = chess.get(square);
    return piece !== undefined && values[piece.type] <= values[move.piece];
  });
}

/** Compatibility one-ply hanging-piece signal used by existing UI fields. */
export function hangsPiece(fenBefore: string, moveSan: string): boolean {
  const chess = new Chess(fenBefore);
  let move;
  try {
    move = chess.move(moveSan);
  } catch {
    return false;
  }
  if (!move || move.piece === 'p' || move.piece === 'k') return false;
  const opponentColor = move.color === 'w' ? 'b' : 'w';
  return chess.isAttacked(move.to, opponentColor) && !chess.isAttacked(move.to, move.color);
}

export { classifyMove } from './classify-move.js';
export type { MoveClassificationInput } from './classify-context.js';
