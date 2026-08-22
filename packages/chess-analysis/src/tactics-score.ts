import { Chess, type Square } from 'chess.js';
import type { EngineEval, FeatureDeltaDto, MoveQuality, PositionFeatures } from '@chess-coach/shared';
import { toColorName } from './attack-map.js';
import { see } from './see.js';
import { toCpWhite, winPctFor } from './win-probability.js';

const EVAL_GAP_THRESHOLD = 8;
const MIN_TACTICAL_POSITIONS = 4;

const BRILLIANT_BONUS = 6;
const GREAT_BONUS = 3;
const BEST_IN_TACTICAL_BONUS = 1.5;
const MISS_PENALTY = -4;
const BLUNDER_IN_TACTICAL_PENALTY = -3;
const MISTAKE_IN_TACTICAL_PENALTY = -1.5;
const NEW_HANGING_PIECE_PENALTY = -2;
const NEW_OPPONENT_FORK_PENALTY = -2;
const EVIDENCE_CLAMP = 15;

export interface TacticalPositionInput {
  mover: 'white' | 'black';
  fenBefore: string;
  /** The position's evaluation, MultiPV — `lines[0]`/`lines[1]` feed the gap
   * check. */
  evalBefore: EngineEval;
  /** Features of `fenBefore` (before the move). */
  features: PositionFeatures;
}

/** §7.2's seven-clause OR partitioning plies into tactical vs. quiet. */
export function isTacticalPosition(input: TacticalPositionInput): boolean {
  return (
    hasForcedMate(input) ||
    hasLargeEvalGap(input) ||
    hasHangingPieces(input) ||
    hasForks(input) ||
    hasFavorableCapture(input) ||
    hasUnderDefendedPiece(input) ||
    bestMoveIsCheckOrSoundCapture(input)
  );
}

function hasForcedMate(input: TacticalPositionInput): boolean {
  return (input.evalBefore.lines[0]?.mateIn ?? null) !== null;
}

function hasLargeEvalGap(input: TacticalPositionInput): boolean {
  const [best, second] = input.evalBefore.lines;
  if (!best || !second) return false;
  const bestWin = winPctFor(input.mover, toCpWhite(best));
  const secondWin = winPctFor(input.mover, toCpWhite(second));
  return Math.abs(bestWin - secondWin) >= EVAL_GAP_THRESHOLD;
}

function hasHangingPieces(input: TacticalPositionInput): boolean {
  return input.features.hangingPieces.length > 0;
}

function hasForks(input: TacticalPositionInput): boolean {
  return input.features.forks.length > 0;
}

function hasFavorableCapture(input: TacticalPositionInput): boolean {
  const side = input.mover === 'white' ? 'w' : 'b';
  return input.features.captureOpportunities.some(
    (capture) => see(input.fenBefore, capture.to as Square, side) > 0
  );
}

function hasUnderDefendedPiece(input: TacticalPositionInput): boolean {
  return input.features.piecesUnderAttack.some((piece) => piece.attackers > piece.defenders);
}

function bestMoveIsCheckOrSoundCapture(input: TacticalPositionInput): boolean {
  const bestSan = input.evalBefore.lines[0]?.moveSan;
  if (!bestSan) return false;

  const chess = new Chess(input.fenBefore);
  let move;
  try {
    move = chess.move(bestSan);
  } catch {
    return false;
  }
  if (chess.isCheck()) return true;
  if (!move.captured) return false;

  const side = input.mover === 'white' ? 'w' : 'b';
  return see(input.fenBefore, move.to as Square, side) >= 0;
}

export interface TacticsEvidenceMove {
  mover: 'white' | 'black';
  quality: MoveQuality;
  fenAfter: string;
  featureDelta: FeatureDeltaDto;
  isTacticalPosition: boolean;
}

/** §7.2's evidence adjustment — rewards decisive tactical play, penalizes
 * missed/blown tactics and self-inflicted hanging pieces/forks. */
export function tacticalEvidence(moves: readonly TacticsEvidenceMove[]): number {
  return moves.reduce((total, move) => total + evidenceForMove(move), 0);
}

function evidenceForMove(move: TacticsEvidenceMove): number {
  let evidence = 0;
  if (move.quality === 'brilliant') evidence += BRILLIANT_BONUS;
  if (move.quality === 'great') evidence += GREAT_BONUS;
  if (move.quality === 'best' && move.isTacticalPosition) evidence += BEST_IN_TACTICAL_BONUS;
  if (move.quality === 'miss') evidence += MISS_PENALTY;
  if (move.quality === 'blunder' && move.isTacticalPosition) evidence += BLUNDER_IN_TACTICAL_PENALTY;
  if (move.quality === 'mistake' && move.isTacticalPosition) evidence += MISTAKE_IN_TACTICAL_PENALTY;
  if (createdNewHangingPiece(move)) evidence += NEW_HANGING_PIECE_PENALTY;
  if (allowedNewOpponentFork(move)) evidence += NEW_OPPONENT_FORK_PENALTY;
  return evidence;
}

function createdNewHangingPiece(move: TacticsEvidenceMove): boolean {
  return move.featureDelta.newHangingPieces.some((piece) => piece.color === move.mover);
}

function allowedNewOpponentFork(move: TacticsEvidenceMove): boolean {
  if (move.featureDelta.newForks.length === 0) return false;
  const board = new Chess(move.fenAfter);
  return move.featureDelta.newForks.some((fork) => {
    const piece = board.get(fork.square as Square);
    return piece !== undefined && toColorName(piece.color) !== move.mover;
  });
}

export interface TacticsScoreResult {
  score: number | null;
  reason?: 'insufficient tactical positions';
}

/**
 * §7.2's final score: `tacticalAccuracy` (the §4 aggregate machinery,
 * restricted to tactical-position moves and weighted from the full-game
 * series — computed by the caller, not here) plus the clamped evidence
 * adjustment. `null` with a reason when the colour saw fewer than 4 tactical
 * positions — a score from one or two positions is noise.
 */
export function tacticsScore(
  moves: readonly TacticsEvidenceMove[],
  tacticalAccuracy: number | null
): TacticsScoreResult {
  const tacticalPositionCount = moves.filter((move) => move.isTacticalPosition).length;
  if (tacticalPositionCount < MIN_TACTICAL_POSITIONS || tacticalAccuracy === null) {
    return { score: null, reason: 'insufficient tactical positions' };
  }

  const evidence = clamp(tacticalEvidence(moves), -EVIDENCE_CLAMP, EVIDENCE_CLAMP);
  return { score: clamp(tacticalAccuracy + evidence, 0, 100) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
