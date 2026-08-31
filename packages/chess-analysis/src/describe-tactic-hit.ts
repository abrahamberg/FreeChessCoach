import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName } from './attack-map.js';
import { PIECE_NAMES } from './move-reasons.js';
import { overloadedDefenders } from './piece-safety.js';
import { discoveredAttackDetail } from './tactic-discovered.js';
import { pins } from './tactic-pins.js';
import { removesDefender } from './tactic-removes-defender.js';
import { skewers } from './tactic-skewers.js';
import { trappedPieces } from './tactic-trapped.js';
import { captureOpportunities, forks } from './tactics.js';
import type { TacticMotifType } from '@freechesscoach/shared';

/**
 * One human-readable sentence naming the concrete piece(s)/square(s) behind
 * a `TacticMotifType` hit — the "which trapped piece?" detail neither the
 * per-game `TacticMotifCounts` tally nor the per-ply `{ type, found }`/
 * `{ type, prevented }` fields carry on their own (both are deliberately
 * type-level only). Replays `moveSan` from `fenBefore` itself, so it works
 * equally for a real played move (tacticOpportunity) and a candidate move
 * from a PV sighting (tacticPrevention) — see `PvMotifSighting.fenBefore`.
 *
 * Returns `null` for `checkmate`/`brilliantSacrifice`/`other` (no
 * detector-specific shape to describe) or when `moveSan` doesn't replay
 * legally from `fenBefore` — callers fall back to naming just the move.
 */
export function describeTacticHit(type: TacticMotifType, fenBefore: string, moveSan: string, mover: 'white' | 'black'): string | null {
  const moverColor: Color = mover === 'white' ? 'w' : 'b';
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  let destination: Square | null = null;
  try {
    const move = after.move(moveSan);
    destination = move ? (move.to as Square) : null;
  } catch {
    return null;
  }
  if (!destination) return null;

  switch (type) {
    case 'fork':
      return describeFork(after, destination);
    case 'pin':
      return describePin(after, destination);
    case 'skewer':
      return describeSkewer(after, destination);
    case 'trappedPiece':
      return describeTrappedPiece(after, opponentOf(moverColor));
    case 'freePiece':
      return describeFreePiece(before, moveSan);
    case 'overloadedDefender':
      return describeOverloadedDefender(after, opponentOf(moverColor), destination);
    case 'removesDefender':
      return describeRemovesDefender(fenBefore, moveSan, moverColor);
    case 'discoveredAttack':
      return describeDiscoveredAttack(fenBefore, moveSan, moverColor);
    case 'weakBackRank':
      return describeWeakBackRank(after, moverColor, destination);
    case 'doubleCheck':
      return describeDoubleCheck(after, moverColor);
    default:
      return null;
  }
}

function describeFork(after: Chess, destination: Square): string | null {
  const hit = forks(after, buildAttackMap(after)).find((f) => f.square === destination);
  if (!hit) return null;
  return `${PIECE_NAMES[hit.piece]} on ${hit.square} forks ${formatList(hit.forkedSquares)}`;
}

function describePin(after: Chess, destination: Square): string | null {
  const hit = pins(after).find((p) => p.by === destination);
  if (!hit) return null;
  const pinnedPiece = after.get(hit.pinned);
  const pinnedName = pinnedPiece ? PIECE_NAMES[pinnedPiece.type] : 'piece';
  return `pins the ${pinnedName} on ${hit.pinned} against ${hit.against}`;
}

function describeSkewer(after: Chess, destination: Square): string | null {
  const hit = skewers(after).find((s) => s.by === destination);
  if (!hit) return null;
  const frontPiece = after.get(hit.front);
  const behindPiece = after.get(hit.behind);
  const frontName = frontPiece ? PIECE_NAMES[frontPiece.type] : 'piece';
  const behindName = behindPiece ? PIECE_NAMES[behindPiece.type] : 'piece';
  return `skewers the ${frontName} on ${hit.front}, exposing the ${behindName} on ${hit.behind}`;
}

function describeTrappedPiece(after: Chess, trappedColor: Color): string | null {
  const hits = trappedPieces(after, trappedColor);
  if (hits.length === 0) return null;
  return hits.map((hit) => `${PIECE_NAMES[hit.piece]} on ${hit.square}`).join(', ') + (hits.length > 1 ? ' are trapped' : ' is trapped');
}

function describeFreePiece(before: Chess, moveSan: string): string | null {
  const hit = captureOpportunities(before, buildAttackMap(before)).find((c) => c.moveSan === moveSan && c.favorable);
  if (!hit) return null;
  return `captures the undefended ${PIECE_NAMES[hit.capturedPiece]} on ${hit.to}`;
}

function describeOverloadedDefender(after: Chess, defenderColor: Color, destination: Square): string | null {
  const attackMap = buildAttackMap(after);
  const attackerColorName = toColorName(opponentOf(defenderColor));
  const hit = overloadedDefenders(after, attackMap)
    .filter((h) => after.get(h.square as Square)?.color === defenderColor)
    .find((h) => h.defending.some((duty) => (attackMap.attackersOf.get(duty as Square)?.[attackerColorName] ?? []).includes(destination)));
  if (!hit) return null;
  const defenderPiece = after.get(hit.square as Square);
  const defenderName = defenderPiece ? PIECE_NAMES[defenderPiece.type] : 'piece';
  return `overloads the ${defenderName} on ${hit.square}, which must also guard ${formatList(hit.defending)}`;
}

function describeRemovesDefender(fenBefore: string, moveSan: string, mover: Color): string | null {
  const hit = removesDefender(fenBefore, moveSan, mover);
  if (!hit) return null;
  return `removes the defender on ${hit.capturedDefender}, leaving the piece on ${hit.exposedTarget} undefended`;
}

function describeDiscoveredAttack(fenBefore: string, moveSan: string, mover: Color): string | null {
  const hit = discoveredAttackDetail(fenBefore, moveSan, mover);
  if (!hit) return null;
  return `${PIECE_NAMES[hit.pieceType]} on ${hit.piece} gains a discovered attack on ${hit.revealed}`;
}

function describeWeakBackRank(after: Chess, mover: Color, destination: Square): string | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  const checker = after.get(destination);
  const checkerName = checker ? PIECE_NAMES[checker.type] : 'piece';
  return `${checkerName} on ${destination} checks the king on ${king.square}, boxed in on the back rank`;
}

function describeDoubleCheck(after: Chess, mover: Color): string | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  const attackMap = buildAttackMap(after);
  const checkers = attackMap.attackersOf.get(king.square)?.[toColorName(mover)] ?? [];
  if (checkers.length < 2) return null;
  return `checks the king on ${king.square} from ${formatList(checkers)} at once`;
}

function formatList(squares: readonly string[]): string {
  if (squares.length <= 1) return squares[0] ?? '';
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}
