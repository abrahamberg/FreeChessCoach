import type { MovePhase } from '@freechesscoach/shared';
import { phaseUnits } from './phase-signals.js';
import { CONFIG } from './config.js';

const {
  openingFallbackPly: OPENING_FALLBACK_PLY,
  openingMaxPly: OPENING_MAX_PLY,
  openingBookMinPly: OPENING_BOOK_MIN_PLY,
  endgamePhaseUnitThreshold: ENDGAME_PHASE_UNIT_THRESHOLD,
  lowConfidenceMaxMoves: LOW_CONFIDENCE_MAX_MOVES
} = CONFIG.phaseSegmentation;

export interface PhasePosition {
  ply: number;
  fen: string;
}

export interface PhaseBoundaries {
  openingEndPly: number;
  endgameStartPly: number | null;
}

/**
 * §6.1 — the opening/middlegame boundary: however deep the book coverage
 * ran (once it reaches a minimum credible depth), or a fallback minimum
 * otherwise, capped so "opening" never runs past move 15.
 */
export function openingEndPly(lastBookPly: number): number {
  const raw = lastBookPly >= OPENING_BOOK_MIN_PLY ? lastBookPly : OPENING_FALLBACK_PLY;
  return Math.min(raw, OPENING_MAX_PLY);
}

/**
 * §6.2/§6.3 — the middlegame/endgame boundary: the first ply whose combined
 * phase units drop to the endgame threshold. `null` when the game never
 * reaches it. Forced to land after `openingEndPly` (§6.3's guard) in case
 * material vanishes inside the book.
 */
export function endgameStartPly(positions: PhasePosition[], openingEndPly: number): number | null {
  const firstEndgamePosition = positions.find((position) => phaseUnits(position.fen) <= ENDGAME_PHASE_UNIT_THRESHOLD);
  if (!firstEndgamePosition) return null;
  return Math.max(firstEndgamePosition.ply, openingEndPly + 1);
}

/** Classifies a single ply against the game's already-resolved boundaries. */
export function phaseForPly(ply: number, boundaries: PhaseBoundaries): MovePhase {
  if (ply <= boundaries.openingEndPly) return 'opening';
  if (boundaries.endgameStartPly !== null && ply >= boundaries.endgameStartPly) return 'endgame';
  return 'middlegame';
}

/**
 * §6.3 — a phase accuracy computed from only 1-2 moves is statistically
 * meaningless and should be flagged, not hidden (zero moves is a separate
 * case: callers report `null` there, via `aggregateAccuracy`'s own guard).
 */
export function isLowConfidencePhase(moveCount: number): boolean {
  return moveCount >= 1 && moveCount <= LOW_CONFIDENCE_MAX_MOVES;
}
