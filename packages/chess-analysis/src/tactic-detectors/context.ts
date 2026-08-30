import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, type AttackMap } from '../attack-map.js';

function toColor(mover: 'white' | 'black'): Color {
  return mover === 'white' ? 'w' : 'b';
}

/**
 * Everything a registry detector (Task 32.2/32.3) might need, computed once
 * per candidate move instead of each detector re-replaying it. Detectors
 * whose algorithm needs a differently-shaped before/after diff (discovered
 * attack, removes-defender) ignore `after`/`afterAttackMap` and do their own
 * internal replay instead — see `tactic-detectors/README.md`.
 */
export interface TacticDetectionContext {
  fenBefore: string;
  moveSan: string;
  mover: Color;
  before: Chess;
  beforeAttackMap: AttackMap;
  /** null when `moveSan` doesn't apply legally from `fenBefore`. */
  after: Chess | null;
  afterAttackMap: AttackMap | null;
  destination: Square | null;
}

export function buildTacticDetectionContext(
  fenBefore: string,
  moveSan: string,
  mover: 'white' | 'black'
): TacticDetectionContext {
  const before = new Chess(fenBefore);
  const beforeAttackMap = buildAttackMap(before);

  const after = new Chess(fenBefore);
  let destination: Square | null = null;
  try {
    const move = after.move(moveSan);
    destination = move ? (move.to as Square) : null;
  } catch {
    destination = null;
  }

  return {
    fenBefore,
    moveSan,
    mover: toColor(mover),
    before,
    beforeAttackMap,
    after: destination ? after : null,
    afterAttackMap: destination ? buildAttackMap(after) : null,
    destination
  };
}
