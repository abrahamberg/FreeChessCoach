import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, occupiedSquares, opponentOf, toColorName } from './attack-map.js';
import { PIECE_NAMES } from './move-reasons.js';
import { overloadedDefenders } from './piece-safety.js';
import { discoveredAttackDetail } from './tactic-discovered.js';
import { pins } from './tactic-pins.js';
import { replayTacticMove } from './tactic-replay.js';
import { removesDefender } from './tactic-removes-defender.js';
import { skewers } from './tactic-skewers.js';
import { trappedPieces } from './tactic-trapped.js';
import { captureOpportunities, forks } from './tactics.js';
import type { TacticMotifType, TacticVisualDto } from '@freechesscoach/shared';

export interface TacticHitDetail {
  /** The human-readable sentence naming the concrete piece(s)/square(s)
   * involved — describeTacticHit's own return value. */
  text: string;
  /** The same hit's board geometry — tacticHitVisual's own return value. */
  visual: TacticVisualDto;
}

/**
 * The single source of truth behind both `describeTacticHit`'s sentence and
 * `tacticHitVisual`'s board geometry for a `TacticMotifType` hit — same
 * motif, same replay, computed once. `describeTacticHit`/`tacticHitVisual`
 * are thin wrappers over this kept for their existing, independently
 * tested call shapes; every real caller that needs *both* fields
 * (`classifyTacticMotifOpportunity`, tactic-prevention.ts's
 * `describeMotifSighting`) calls this directly instead — calling the two
 * wrappers back to back for the same hit would replay the move and rebuild
 * the same attack maps/detector scans twice for nothing.
 *
 * Returns `null` for `checkmate`/`brilliantSacrifice`/`other` (no
 * detector-specific shape to describe) or when `moveSan` doesn't replay
 * legally from `fenBefore`.
 */
export function tacticHitDetail(type: TacticMotifType, fenBefore: string, moveSan: string, mover: 'white' | 'black'): TacticHitDetail | null {
  const moverColor: Color = mover === 'white' ? 'w' : 'b';
  const replay = replayTacticMove(fenBefore, moveSan);
  if (!replay) return null;
  const { before, after, destination } = replay;

  switch (type) {
    case 'fork':
      return forkDetail(after, destination);
    case 'pin':
      return pinDetail(after, destination);
    case 'skewer':
      return skewerDetail(after, destination);
    case 'trappedPiece':
      return trappedPieceDetail(after, opponentOf(moverColor));
    case 'freePiece':
      return freePieceDetail(before, moveSan);
    case 'overloadedDefender':
      return overloadedDefenderDetail(after, opponentOf(moverColor), destination);
    case 'removesDefender':
      return removesDefenderDetailFor(fenBefore, moveSan, moverColor);
    case 'discoveredAttack':
      return discoveredAttackDetailFor(fenBefore, moveSan, moverColor);
    case 'weakBackRank':
      return weakBackRankDetail(after, moverColor, destination);
    case 'doubleCheck':
      return doubleCheckDetail(after, moverColor);
    default:
      return null;
  }
}

function forkDetail(after: Chess, destination: Square): TacticHitDetail | null {
  const hit = forks(after, buildAttackMap(after)).find((f) => f.square === destination);
  if (!hit) return null;
  return {
    text: `${PIECE_NAMES[hit.piece]} on ${hit.square} forks ${formatList(hit.forkedSquares)}`,
    visual: { arrows: hit.forkedSquares.map((square) => ({ from: hit.square, to: square })), highlights: [] }
  };
}

function pinDetail(after: Chess, destination: Square): TacticHitDetail | null {
  const hit = pins(after).find((p) => p.by === destination);
  if (!hit) return null;
  const pinnedPiece = after.get(hit.pinned);
  const pinnedName = pinnedPiece ? PIECE_NAMES[pinnedPiece.type] : 'piece';
  return {
    text: `pins the ${pinnedName} on ${hit.pinned} against ${hit.against}`,
    visual: { arrows: [{ from: hit.by, to: hit.against }], highlights: [hit.pinned] }
  };
}

function skewerDetail(after: Chess, destination: Square): TacticHitDetail | null {
  const hit = skewers(after).find((s) => s.by === destination);
  if (!hit) return null;
  const frontPiece = after.get(hit.front);
  const behindPiece = after.get(hit.behind);
  const frontName = frontPiece ? PIECE_NAMES[frontPiece.type] : 'piece';
  const behindName = behindPiece ? PIECE_NAMES[behindPiece.type] : 'piece';
  return {
    text: `skewers the ${frontName} on ${hit.front}, exposing the ${behindName} on ${hit.behind}`,
    visual: { arrows: [{ from: hit.by, to: hit.behind }], highlights: [hit.front] }
  };
}

function trappedPieceDetail(after: Chess, trappedColor: Color): TacticHitDetail | null {
  const hits = trappedPieces(after, trappedColor);
  if (hits.length === 0) return null;
  return {
    text: hits.map((hit) => `${PIECE_NAMES[hit.piece]} on ${hit.square}`).join(', ') + (hits.length > 1 ? ' are trapped' : ' is trapped'),
    visual: { arrows: [], highlights: hits.map((hit) => hit.square) }
  };
}

function freePieceDetail(before: Chess, moveSan: string): TacticHitDetail | null {
  const hit = captureOpportunities(before, buildAttackMap(before)).find((c) => c.moveSan === moveSan && c.favorable);
  if (!hit) return null;
  return {
    text: `captures the undefended ${PIECE_NAMES[hit.capturedPiece]} on ${hit.to}`,
    visual: { arrows: [{ from: hit.from, to: hit.to }], highlights: [] }
  };
}

function overloadedDefenderDetail(after: Chess, defenderColor: Color, destination: Square): TacticHitDetail | null {
  const attackMap = buildAttackMap(after);
  const attackerColorName = toColorName(opponentOf(defenderColor));
  const hit = overloadedDefenders(after, attackMap)
    .filter((h) => after.get(h.square as Square)?.color === defenderColor)
    .find((h) => h.defending.some((duty) => (attackMap.attackersOf.get(duty as Square)?.[attackerColorName] ?? []).includes(destination)));
  if (!hit) return null;
  const defenderPiece = after.get(hit.square as Square);
  const defenderName = defenderPiece ? PIECE_NAMES[defenderPiece.type] : 'piece';
  return {
    text: `overloads the ${defenderName} on ${hit.square}, which must also guard ${formatList(hit.defending)}`,
    visual: { arrows: hit.defending.map((square) => ({ from: hit.square, to: square })), highlights: [hit.square] }
  };
}

function removesDefenderDetailFor(fenBefore: string, moveSan: string, mover: Color): TacticHitDetail | null {
  const hit = removesDefender(fenBefore, moveSan, mover);
  if (!hit) return null;
  return {
    text: `removes the defender on ${hit.capturedDefender}, leaving the piece on ${hit.exposedTarget} undefended`,
    visual: { arrows: [{ from: hit.capturedDefender, to: hit.exposedTarget }], highlights: [] }
  };
}

function discoveredAttackDetailFor(fenBefore: string, moveSan: string, mover: Color): TacticHitDetail | null {
  const hit = discoveredAttackDetail(fenBefore, moveSan, mover);
  if (!hit) return null;
  return {
    text: `${PIECE_NAMES[hit.pieceType]} on ${hit.piece} gains a discovered attack on ${hit.revealed}`,
    visual: { arrows: [{ from: hit.piece, to: hit.revealed }], highlights: [] }
  };
}

function weakBackRankDetail(after: Chess, mover: Color, destination: Square): TacticHitDetail | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  const checker = after.get(destination);
  const checkerName = checker ? PIECE_NAMES[checker.type] : 'piece';
  return {
    text: `${checkerName} on ${destination} checks the king on ${king.square}, boxed in on the back rank`,
    visual: { arrows: [{ from: destination, to: king.square }], highlights: [] }
  };
}

function doubleCheckDetail(after: Chess, mover: Color): TacticHitDetail | null {
  const opponent = opponentOf(mover);
  const king = occupiedSquares(after).find((piece) => piece.type === 'k' && piece.color === opponent);
  if (!king) return null;
  const attackMap = buildAttackMap(after);
  const checkers = attackMap.attackersOf.get(king.square)?.[toColorName(mover)] ?? [];
  if (checkers.length < 2) return null;
  return {
    text: `checks the king on ${king.square} from ${formatList(checkers)} at once`,
    visual: { arrows: checkers.map((square) => ({ from: square, to: king.square })), highlights: [] }
  };
}

function formatList(squares: readonly string[]): string {
  if (squares.length <= 1) return squares[0] ?? '';
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}
