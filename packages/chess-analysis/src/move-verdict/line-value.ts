import type { PieceSymbol } from 'chess.js';
import type { EngineLine } from '@freechesscoach/shared';
import { walkMaterialLine } from '../verify-tactic-line.js';
import type { PlayerColor } from '../win-probability.js';

/**
 * What one line does to the mover's material: the gained/lost/net walk of
 * `docs/plan.md` Task 77.5 step 4. Built on `verify-tactic-line.ts`'s
 * material walk (`walkMaterialLine`, capped at
 * `CONFIG.tacticVerification.maxLinePlies`), so "won a rook" means the same
 * thing here as it does to the line verifier.
 */
export interface LineValue {
  /** Material the mover took (or promoted into) along the line, in pawns. */
  gainedPawns: number;
  /** Material the opponent took (or promoted into), in pawns. */
  lostPawns: number;
  mateFor: boolean;
  mateAgainst: boolean;
  /** What the mover captured, in line order — the card's detail names it. */
  gains: PieceSymbol[];
  /** What the opponent captured, in line order. */
  losses: PieceSymbol[];
}

export const EMPTY_LINE_VALUE: LineValue = {
  gainedPawns: 0,
  lostPawns: 0,
  mateFor: false,
  mateAgainst: false,
  gains: [],
  losses: []
};

/**
 * Walks `pvSan` from `fen`, where the first move is `mover`'s. `line`, when
 * given, is the engine line the walk came from: its `mateIn` (White
 * perspective) counts as mate even when the walk is cut short of it.
 */
export function walkLineValue(
  fen: string,
  pvSan: readonly string[],
  mover: PlayerColor,
  line?: Pick<EngineLine, 'mateIn'>
): LineValue {
  const steps = walkMaterialLine(fen, mover === 'white' ? 'w' : 'b', pvSan);
  const value: LineValue = { ...EMPTY_LINE_VALUE, gains: [], losses: [] };
  let previousGain = 0;

  for (const step of steps) {
    const delta = step.gain - previousGain;
    previousGain = step.gain;
    if (step.moverMoved) addGain(value, delta, step.capturedPiece);
    else addLoss(value, delta, step.capturedPiece);
    if (step.isCheckmate) markMate(value, step.moverMoved);
  }
  return withEngineMate(value, mover, line);
}

/** `gained − lost`, in pawns. */
export function netPawns(value: LineValue): number {
  return value.gainedPawns - value.lostPawns;
}

/** The side whose `mateIn` it is, `null` for a cp score. */
export function mateSide(line: Pick<EngineLine, 'mateIn'> | undefined): PlayerColor | null {
  if (!line || line.mateIn === null) return null;
  return line.mateIn > 0 ? 'white' : 'black';
}

function addGain(value: LineValue, delta: number, captured: PieceSymbol | null): void {
  if (delta > 0) value.gainedPawns += delta;
  if (captured) value.gains.push(captured);
}

function addLoss(value: LineValue, delta: number, captured: PieceSymbol | null): void {
  if (delta < 0) value.lostPawns -= delta;
  if (captured) value.losses.push(captured);
}

function markMate(value: LineValue, byMover: boolean): void {
  if (byMover) value.mateFor = true;
  else value.mateAgainst = true;
}

function withEngineMate(value: LineValue, mover: PlayerColor, line: Pick<EngineLine, 'mateIn'> | undefined): LineValue {
  const side = mateSide(line);
  if (side === null) return value;
  return side === mover ? { ...value, mateFor: true } : { ...value, mateAgainst: true };
}
