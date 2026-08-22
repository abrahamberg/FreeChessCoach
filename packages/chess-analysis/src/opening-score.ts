import { Chess, type Square } from 'chess.js';
import { castledPly, developedMinorPieceCount, type DevelopmentColor } from './opening-development.js';
import { computePositionFeatures } from './position-features.js';
import type { ParsedPosition } from './pgn.js';

const BOOK_DEPTH_FULL_SCORE_PLY = 16; // 8 full moves of theory = 100
const CASTLED_BONUS = 25;
const DEVELOPED_MINOR_BONUS_PER_PIECE = 10;
const MAX_DEVELOPED_MINOR_BONUS = 40;
const CENTER_CONTROL_BONUS = 15;
const NO_REPEATED_MOVE_BONUS = 10;
const NO_EXCESS_PAWN_MOVE_BONUS = 10;
const NECESSARY_PAWN_MOVES = 2;
const MAX_ALLOWED_PAWN_MOVES = NECESSARY_PAWN_MOVES + 1;

const OPENING_ACCURACY_WEIGHT = 0.55;
const BOOK_DEPTH_WEIGHT = 0.2;
const DEVELOPMENT_WEIGHT = 0.25;

/** §7.1 — 8 full moves (ply 16) of book coverage for this colour is a full score. */
export function bookDepthScore(lastBookPlyForColour: number): number {
  return clamp((100 * lastBookPlyForColour) / BOOK_DEPTH_FULL_SCORE_PLY, 0, 100);
}

export interface DevelopmentScoreInput {
  positions: readonly ParsedPosition[];
  color: DevelopmentColor;
  openingEndPly: number;
}

/** §7.1's developmentScore, evaluated at `openingEndPly`. */
export function developmentScore(input: DevelopmentScoreInput): number {
  const { positions, color, openingEndPly } = input;
  const boundaryFen = positionAtOrBefore(positions, openingEndPly).fen;

  let score = 0;
  if (isKingSafe(positions, color, openingEndPly, boundaryFen)) score += CASTLED_BONUS;
  score += Math.min(
    MAX_DEVELOPED_MINOR_BONUS,
    DEVELOPED_MINOR_BONUS_PER_PIECE * developedMinorPieceCount(boundaryFen, color)
  );
  if (hasCenterAdvantage(boundaryFen, color)) score += CENTER_CONTROL_BONUS;
  if (!hasRepeatedNonCaptureMove(positions, color, openingEndPly)) score += NO_REPEATED_MOVE_BONUS;
  if (countPawnMoves(positions, color, openingEndPly) <= MAX_ALLOWED_PAWN_MOVES) score += NO_EXCESS_PAWN_MOVE_BONUS;
  return clamp(score, 0, 100);
}

export interface OpeningScoreInput {
  /** phaseAccuracy(colour, 'opening') — §6.4. `null` propagates (no opening
   * moves played by this colour is not a real game, but stay defensive). */
  openingAccuracy: number | null;
  bookDepthScore: number;
  developmentScore: number;
}

/** §7.1's weighted sum. */
export function openingScore(input: OpeningScoreInput): number | null {
  if (input.openingAccuracy === null) return null;
  return clamp(
    OPENING_ACCURACY_WEIGHT * input.openingAccuracy +
      BOOK_DEPTH_WEIGHT * input.bookDepthScore +
      DEVELOPMENT_WEIGHT * input.developmentScore,
    0,
    100
  );
}

function positionAtOrBefore(positions: readonly ParsedPosition[], ply: number): ParsedPosition {
  let candidate: ParsedPosition | undefined;
  for (const position of positions) {
    if (position.ply > ply) break;
    candidate = position;
  }
  if (!candidate) throw new Error(`No position found at or before ply ${ply}`);
  return candidate;
}

function isKingSafe(
  positions: readonly ParsedPosition[],
  color: DevelopmentColor,
  openingEndPly: number,
  boundaryFen: string
): boolean {
  const castled = castledPly(positions, color);
  if (castled !== null && castled <= openingEndPly) return true;
  return isUncastledKingSafe(boundaryFen, color);
}

function isUncastledKingSafe(fen: string, color: DevelopmentColor): boolean {
  const chess = new Chess(fen);
  const kingHomeSquare: Square = color === 'white' ? 'e1' : 'e8';
  const king = chess.get(kingHomeSquare);
  if (!king || king.type !== 'k' || king.color !== toChessColor(color)) return false;
  return hasConnectedRook(chess, color);
}

function hasConnectedRook(chess: Chess, color: DevelopmentColor): boolean {
  const rank = color === 'white' ? '1' : '8';
  return ['a', 'h'].some((rookFile) => {
    const rookSquare = `${rookFile}${rank}` as Square;
    const rook = chess.get(rookSquare);
    if (!rook || rook.type !== 'r' || rook.color !== toChessColor(color)) return false;
    return squaresBetweenAreEmpty(chess, rookFile, 'e', rank);
  });
}

function squaresBetweenAreEmpty(chess: Chess, fileA: string, fileB: string, rank: string): boolean {
  const files = 'abcdefgh';
  const start = Math.min(files.indexOf(fileA), files.indexOf(fileB)) + 1;
  const end = Math.max(files.indexOf(fileA), files.indexOf(fileB));
  for (let index = start; index < end; index += 1) {
    const square = `${files[index]}${rank}` as Square;
    if (chess.get(square)) return false;
  }
  return true;
}

function hasCenterAdvantage(fen: string, color: DevelopmentColor): boolean {
  const { centerControlScore } = computePositionFeatures(fen);
  const opponent: DevelopmentColor = color === 'white' ? 'black' : 'white';
  return centerControlScore[color] >= centerControlScore[opponent];
}

/**
 * A piece is treated as moved "without cause" once it makes a second
 * non-capturing move in the opening — tracked by square lineage (a capture
 * resets the count for the piece landing on the destination square, since
 * capturing is itself the "cause").
 */
function hasRepeatedNonCaptureMove(
  positions: readonly ParsedPosition[],
  color: DevelopmentColor,
  openingEndPly: number
): boolean {
  const moveCounts = new Map<string, number>();

  for (const position of positions) {
    if (position.ply === 0 || position.ply > openingEndPly) continue;
    if (position.mover !== color || !position.moveSan || !position.moveUci) continue;

    const from = position.moveUci.slice(0, 2);
    const to = position.moveUci.slice(2, 4);
    const priorCount = moveCounts.get(from) ?? 0;
    moveCounts.delete(from);

    if (position.moveSan.includes('x')) {
      moveCounts.set(to, 0);
      continue;
    }

    const newCount = priorCount + 1;
    if (newCount >= 2) return true;
    moveCounts.set(to, newCount);
  }

  return false;
}

function countPawnMoves(positions: readonly ParsedPosition[], color: DevelopmentColor, openingEndPly: number): number {
  let count = 0;
  for (const position of positions) {
    if (position.ply === 0 || position.ply > openingEndPly) continue;
    if (position.mover !== color || !position.moveSan) continue;
    if (isPawnMoveSan(position.moveSan)) count += 1;
  }
  return count;
}

function isPawnMoveSan(moveSan: string): boolean {
  return /^[a-h]/.test(moveSan);
}

function toChessColor(color: DevelopmentColor): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
