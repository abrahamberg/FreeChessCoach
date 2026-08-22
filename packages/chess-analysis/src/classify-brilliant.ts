import { Chess, type Square } from 'chess.js';
import { see, seeOnAllOpponentCaptures } from './see.js';
import type { MoveClassificationInput } from './classify-context.js';
import { toCpWhite } from './win-probability.js';
import { CONFIG } from './config.js';

const {
  maxDrop: MAX_DROP,
  lostToDrawBeforeWinMax: LOST_TO_DRAW_BEFORE_WIN_MAX,
  lostToDrawAfterWinMin: LOST_TO_DRAW_AFTER_WIN_MIN,
  minAfterWin: MIN_AFTER_WIN,
  maxBeforeWin: MAX_BEFORE_WIN,
  sacrificeSeeThreshold: SACRIFICE_SEE_THRESHOLD,
  nonObviousAlternativeCpMargin: NON_OBVIOUS_ALTERNATIVE_CP_MARGIN,
  restoredValueRatio: RESTORED_VALUE_RATIO,
  pieceValues: PIECE_VALUES
} = CONFIG.brilliant;

/** Evaluates B1-B8. The API-layer soundness result is deliberately an input;
 * this pure package never performs the extra engine call. */
export function isBrilliantMove(input: MoveClassificationInput): boolean {
  if (!passesBasicGates(input)) return false;

  const move = playedMove(input);
  if (!move || input.isRecapture) return false;
  if (!hasSacrifice(input, move.to)) return false;
  if (input.brilliantSoundness !== true) return false;
  if (!hasNonObviousAlternative(input, move.to)) return false;
  return !restoresSacrificedMaterial(input, move.to);
}

function passesBasicGates(input: MoveClassificationInput): boolean {
  if (input.isBookMove || input.moveFlags.legalMoveCount <= 1) return false;
  if (input.drop > MAX_DROP) return false;
  const lostToDraw = input.beforeWin <= LOST_TO_DRAW_BEFORE_WIN_MAX && input.afterWin >= LOST_TO_DRAW_AFTER_WIN_MIN;
  if (lostToDraw) return true;
  return input.afterWin >= MIN_AFTER_WIN && input.beforeWin <= MAX_BEFORE_WIN;
}

function playedMove(input: MoveClassificationInput): ReturnType<Chess['move']> | null {
  try {
    return new Chess(input.fenBefore).move(input.moveSan);
  } catch {
    return null;
  }
}

function hasSacrifice(input: MoveClassificationInput, destination: string): boolean {
  const worstReply = seeOnAllOpponentCaptures(input.fenAfter, input.mover);
  if (worstReply <= SACRIFICE_SEE_THRESHOLD) return true;
  if (!input.moveFlags.isCapture) return false;

  const side = input.mover === 'white' ? 'w' : 'b';
  return see(input.fenBefore, destination as Square, side) <= SACRIFICE_SEE_THRESHOLD;
}

function hasNonObviousAlternative(input: MoveClassificationInput, destination: string): boolean {
  const playedCp = moverPerspective(input.cpAfter, input.mover);
  return input.evalBefore.lines.slice(1).some((line) => {
    if (!isNonSacrificialAlternative(input, line.moveSan, destination)) return false;
    const alternativeCp = moverPerspective(toCpWhite(line), input.mover);
    return alternativeCp <= playedCp - NON_OBVIOUS_ALTERNATIVE_CP_MARGIN;
  });
}

function isNonSacrificialAlternative(input: MoveClassificationInput, san: string, playedDestination: string): boolean {
  try {
    const chess = new Chess(input.fenBefore);
    const move = chess.move(san);
    if (move.to === playedDestination) return false;
    return seeOnAllOpponentCaptures(chess.fen(), input.mover) > SACRIFICE_SEE_THRESHOLD;
  } catch {
    return false;
  }
}

function restoresSacrificedMaterial(input: MoveClassificationInput, destination: string): boolean {
  const sacrificedValue = sacrificedPieceValue(input);
  if (sacrificedValue === 0) return false;

  const principalVariation = input.bestLinePvSan ?? [];
  const chess = new Chess(input.fenAfter);
  let restoredValue = 0;
  for (const san of principalVariation.slice(1, 3)) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    if (move.color === (input.mover === 'white' ? 'w' : 'b') && move.captured) {
      restoredValue += PIECE_VALUES[move.captured];
    }
  }
  return restoredValue >= sacrificedValue * RESTORED_VALUE_RATIO && destination.length > 0;
}

function sacrificedPieceValue(input: MoveClassificationInput): number {
  try {
    const move = new Chess(input.fenBefore).move(input.moveSan);
    return PIECE_VALUES[move.piece];
  } catch {
    return 0;
  }
}

function moverPerspective(cpWhite: number, mover: 'white' | 'black'): number {
  return mover === 'white' ? cpWhite : -cpWhite;
}

export type { MoveClassificationInput } from './classify-context.js';
