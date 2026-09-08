import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName } from './attack-map.js';
import { overloadedDefenders } from './piece-safety.js';
import { discoveredAttackDetail } from './tactic-discovered.js';
import { pins } from './tactic-pins.js';
import { replayTacticMove } from './tactic-replay.js';
import { removesDefender } from './tactic-removes-defender.js';
import { skewers } from './tactic-skewers.js';
import { trappedPieces } from './tactic-trapped.js';
import { captureOpportunities, forks } from './tactics.js';
import type { TacticMotifType } from '@freechesscoach/shared';

export interface TacticArrow {
  from: string;
  to: string;
}

export interface TacticVisual {
  arrows: TacticArrow[];
  highlights: string[];
}

/**
 * The board geometry behind a `describeTacticHit` sentence — same motif,
 * same `{fenBefore, moveSan, mover}` inputs, same replay (see
 * tactic-replay.ts), just squares instead of prose. Lets the Game Review UI
 * draw an arrow/highlight for "which trapped piece?" instead of only naming
 * it. Returns `null` under the same conditions `describeTacticHit` does: no
 * detector-specific shape for `type`, or `moveSan` doesn't replay legally.
 */
export function tacticHitVisual(type: TacticMotifType, fenBefore: string, moveSan: string, mover: 'white' | 'black'): TacticVisual | null {
  const moverColor: Color = mover === 'white' ? 'w' : 'b';
  const replay = replayTacticMove(fenBefore, moveSan);
  if (!replay) return null;
  const { before, after, destination } = replay;

  switch (type) {
    case 'fork':
      return forkVisual(after, destination);
    case 'pin':
      return pinVisual(after, destination);
    case 'skewer':
      return skewerVisual(after, destination);
    case 'trappedPiece':
      return trappedPieceVisual(after, opponentOf(moverColor));
    case 'freePiece':
      return freePieceVisual(before, moveSan);
    case 'overloadedDefender':
      return overloadedDefenderVisual(after, opponentOf(moverColor), destination);
    case 'removesDefender':
      return removesDefenderVisual(fenBefore, moveSan, moverColor);
    case 'discoveredAttack':
      return discoveredAttackVisual(fenBefore, moveSan, moverColor);
    case 'weakBackRank':
      return weakBackRankVisual(after, moverColor, destination);
    case 'doubleCheck':
      return doubleCheckVisual(after, moverColor);
    default:
      return null;
  }
}

function forkVisual(after: Chess, destination: Square): TacticVisual | null {
  const hit = forks(after, buildAttackMap(after)).find((f) => f.square === destination);
  if (!hit) return null;
  return { arrows: hit.forkedSquares.map((square) => ({ from: hit.square, to: square })), highlights: [] };
}

function pinVisual(after: Chess, destination: Square): TacticVisual | null {
  const hit = pins(after).find((p) => p.by === destination);
  if (!hit) return null;
  return { arrows: [{ from: hit.by, to: hit.against }], highlights: [hit.pinned] };
}

function skewerVisual(after: Chess, destination: Square): TacticVisual | null {
  const hit = skewers(after).find((s) => s.by === destination);
  if (!hit) return null;
  return { arrows: [{ from: hit.by, to: hit.behind }], highlights: [hit.front] };
}

function trappedPieceVisual(after: Chess, trappedColor: Color): TacticVisual | null {
  const hits = trappedPieces(after, trappedColor);
  if (hits.length === 0) return null;
  return { arrows: [], highlights: hits.map((hit) => hit.square) };
}

function freePieceVisual(before: Chess, moveSan: string): TacticVisual | null {
  const hit = captureOpportunities(before, buildAttackMap(before)).find((c) => c.moveSan === moveSan && c.favorable);
  if (!hit) return null;
  return { arrows: [{ from: hit.from, to: hit.to }], highlights: [] };
}

function overloadedDefenderVisual(after: Chess, defenderColor: Color, destination: Square): TacticVisual | null {
  const attackMap = buildAttackMap(after);
  const attackerColorName = toColorName(opponentOf(defenderColor));
  const hit = overloadedDefenders(after, attackMap)
    .filter((h) => after.get(h.square as Square)?.color === defenderColor)
    .find((h) => h.defending.some((duty) => (attackMap.attackersOf.get(duty as Square)?.[attackerColorName] ?? []).includes(destination)));
  if (!hit) return null;
  return { arrows: hit.defending.map((square) => ({ from: hit.square, to: square })), highlights: [hit.square] };
}

function removesDefenderVisual(fenBefore: string, moveSan: string, mover: Color): TacticVisual | null {
  const hit = removesDefender(fenBefore, moveSan, mover);
  if (!hit) return null;
  return { arrows: [{ from: hit.capturedDefender, to: hit.exposedTarget }], highlights: [] };
}

function discoveredAttackVisual(fenBefore: string, moveSan: string, mover: Color): TacticVisual | null {
  const hit = discoveredAttackDetail(fenBefore, moveSan, mover);
  if (!hit) return null;
  return { arrows: [{ from: hit.piece, to: hit.revealed }], highlights: [] };
}

function weakBackRankVisual(after: Chess, mover: Color, destination: Square): TacticVisual | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  return { arrows: [{ from: destination, to: king.square }], highlights: [] };
}

function doubleCheckVisual(after: Chess, mover: Color): TacticVisual | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  const attackMap = buildAttackMap(after);
  const checkers = attackMap.attackersOf.get(king.square)?.[toColorName(mover)] ?? [];
  if (checkers.length < 2) return null;
  return { arrows: checkers.map((square) => ({ from: square, to: king.square })), highlights: [] };
}
