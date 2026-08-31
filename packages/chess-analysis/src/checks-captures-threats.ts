import { Chess, type Color, type Move } from 'chess.js';
import type { AttackedPieceDto, ChecksCapturesThreats, PositionFeatures, ThreatOpportunityDto } from '@freechesscoach/shared';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName, type AttackMap, type OccupiedSquare } from './attack-map.js';
import { computePositionFeatures } from './position-features.js';

export interface AnalyzeChecksCapturesThreats {
  /** Reuse static features already calculated by the move pipeline. */
  featuresBefore?: PositionFeatures;
}

/**
 * Calculates the complete raw CCT inventory for the side to move in
 * `fenBefore`: every legal check, every legal capture, and every quiet legal
 * move that newly attacks an opponent piece. This deliberately does not call
 * or inspect motif detectors; motif classification can consume this stable
 * board-level data later without defining what a threat is.
 */
export function analyzeChecksCapturesThreats(
  fenBefore: string,
  options: AnalyzeChecksCapturesThreats = {}
): ChecksCapturesThreats {
  const chess = new Chess(fenBefore);
  const legalMoves = chess.moves({ verbose: true });
  const mover = chess.turn();
  const beforeAttackMap = buildAttackMap(chess);
  const features = options.featuresBefore ?? computePositionFeatures(fenBefore);
  const checkMoves = legalMoves.filter(isCheckingMove).map(toCheckOpportunity);
  const captureMoves = features.captureOpportunities;
  const threats = legalMoves
    .filter((move) => !isCheckingMove(move) && !isCapture(move))
    .flatMap((move) => threatForMove(fenBefore, move, mover, beforeAttackMap));

  return {
    checks: availableGroup(checkMoves),
    captures: availableGroup(captureMoves),
    threats: availableGroup(threats)
  };
}

function isCheckingMove(move: Move): boolean {
  return move.san.endsWith('+') || move.san.endsWith('#');
}

function isCapture(move: Move): boolean {
  return move.captured !== undefined;
}

function toCheckOpportunity(move: Move) {
  return {
    moveSan: move.san,
    from: move.from,
    to: move.to,
    isCheckmate: move.san.endsWith('#')
  };
}

function threatForMove(
  fenBefore: string,
  move: Move,
  mover: Color,
  beforeAttackMap: AttackMap
): ThreatOpportunityDto[] {
  const after = new Chess(fenBefore);
  after.move(move.san);
  const afterAttackMap = buildAttackMap(after);
  const opponent = opponentOf(mover);
  const targetedPieces = occupiedSquares(after)
    .filter((piece) => piece.color === opponent)
    .flatMap((piece) => newlyTargetedPiece(piece, mover, beforeAttackMap, afterAttackMap));

  if (targetedPieces.length === 0) return [];
  return [{ moveSan: move.san, from: move.from, to: move.to, targetedPieces }];
}

function newlyTargetedPiece(
  piece: OccupiedSquare,
  mover: Color,
  beforeAttackMap: AttackMap,
  afterAttackMap: AttackMap
): AttackedPieceDto[] {
  const beforeAttackers = beforeAttackMap.attackersOf.get(piece.square)?.[toColorName(mover)] ?? [];
  const afterAttackers = afterAttackMap.attackersOf.get(piece.square)?.[toColorName(mover)] ?? [];
  if (beforeAttackers.length > 0 || afterAttackers.length === 0) return [];

  const defenders = afterAttackMap.attackersOf.get(piece.square)?.[toColorName(piece.color)] ?? [];
  return [{
    square: piece.square,
    piece: piece.type,
    color: toColorName(piece.color),
    attackers: afterAttackers.length,
    defenders: defenders.length
  }];
}

function availableGroup<T>(moves: T[]): { available: boolean; moves: T[] } {
  return { available: moves.length > 0, moves };
}
