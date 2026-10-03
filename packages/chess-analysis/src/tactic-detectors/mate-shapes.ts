import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { kingSquareOf } from '../tactic-board-facts.js';
import { neighboursOf } from '../tactic-lookahead.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticMotifType } from '@freechesscoach/shared';
import type { TacticDetectionContext } from './context.js';
import type { TacticDetector } from './types.js';

/**
 * The named mating patterns that are read off the final board alone: the
 * shape of the mate is the whole definition, so each is exact. They add the
 * pattern alongside `checkmate` (never instead of it), the same way
 * `smotheredMateDetector` does. Each is spelled out from the standard
 * definition of the pattern, not from any one tagger.
 */

type MateType = Extract<TacticMotifType, 'anastasiaMate' | 'hookMate' | 'arabianMate' | 'bodenMate' | 'doubleBishopMate' | 'dovetailMate'>;

interface MateScene {
  after: Chess;
  mover: Color;
  mated: Color;
  king: Square;
  /** The piece the mating move landed on. */
  checker: Square;
  checkerType: PieceSymbol;
}

const fileOf = (square: Square): number => square.charCodeAt(0) - 97;
const rankOf = (square: Square): number => Number(square[1]) - 1;
const squareAt = (file: number, rank: number): Square | null =>
  file < 0 || file > 7 || rank < 0 || rank > 7 ? null : (`${String.fromCharCode(97 + file)}${rank + 1}` as Square);
const distance = (a: Square, b: Square): number => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
const onEdge = (square: Square): boolean => [fileOf(square), rankOf(square)].some((axis) => axis === 0 || axis === 7);
const inCorner = (square: Square): boolean => [fileOf(square), rankOf(square)].every((axis) => axis === 0 || axis === 7);

function sceneOf(ctx: TacticDetectionContext): MateScene | null {
  if (!ctx.after || !ctx.destination || !ctx.after.isCheckmate()) return null;
  const king = kingSquareOf(ctx.after, ctx.opponent);
  const checkerType = ctx.after.get(ctx.destination)?.type;
  return king && checkerType ? { after: ctx.after, mover: ctx.mover, mated: ctx.opponent, king, checker: ctx.destination, checkerType } : null;
}

function moversPieces(scene: MateScene, type: PieceSymbol): Square[] {
  return scene.after
    .board()
    .flat()
    .flatMap((cell) => (cell && cell.color === scene.mover && cell.type === type ? [cell.square] : []));
}

/** Queen or rook checks along the edge file, the king's neighbour on the same
 * rank is its own piece, and a knight three files in on that rank covers the
 * flight squares (a king on h7: pawn g7, knight e7, rook on the h-file). */
function anastasia(scene: MateScene): string | null {
  const { king, checker, checkerType, after, mover } = scene;
  if (![0, 7].includes(fileOf(king)) || [0, 7].includes(rankOf(king))) return null;
  if (!['q', 'r'].includes(checkerType) || fileOf(checker) !== fileOf(king)) return null;
  const inward = fileOf(king) === 0 ? 1 : -1;
  const blocker = squareAt(fileOf(king) + inward, rankOf(king));
  const knight = squareAt(fileOf(king) + 3 * inward, rankOf(king));
  if (!blocker || !knight) return null;
  const blocking = after.get(blocker);
  if (!blocking || blocking.color === mover) return null;
  const knightHere = after.get(knight);
  return knightHere?.type === 'n' && knightHere.color === mover ? `the ${checkerType === 'q' ? 'queen' : 'rook'} checks on the ${king[0]}-file and the knight on ${knight} takes away the rest` : null;
}

/** Rook next to the king, held by a knight that is also next to the king,
 * and that knight is held by a pawn. */
function hook(scene: MateScene): string | null {
  const { king, checker, checkerType, after, mover } = scene;
  if (checkerType !== 'r' || distance(checker, king) !== 1) return null;
  for (const knight of moversPieces(scene, 'n')) {
    if (distance(knight, king) !== 1 || !after.attackers(checker, mover).includes(knight)) continue;
    const pawn = after.attackers(knight, mover).find((square) => after.get(square)?.type === 'p');
    if (pawn) return `the rook on ${checker} is held by the knight on ${knight}, which the pawn on ${pawn} holds`;
  }
  return null;
}

/** Cornered king, rook beside it, knight two files and two ranks from the
 * corner covering the rook. */
function arabian(scene: MateScene): string | null {
  const { king, checker, checkerType, after, mover } = scene;
  if (checkerType !== 'r' || !inCorner(king) || distance(checker, king) !== 1) return null;
  const knight = after
    .attackers(checker, mover)
    .find((square) => after.get(square)?.type === 'n' && Math.abs(fileOf(square) - fileOf(king)) === 2 && Math.abs(rankOf(square) - rankOf(king)) === 2);
  return knight ? `the rook on ${checker} beside the cornered king is held by the knight on ${knight}` : null;
}

/** Two bishops cover every square round the king (and the king's own), and
 * nothing else of the mover's touches that block. Boden's when the bishops
 * sit on opposite sides of the king's file; the same side is the
 * double-bishop mate. */
function bishops(scene: MateScene): { type: 'bodenMate' | 'doubleBishopMate'; detail: string } | null {
  const { king, checkerType, after, mover } = scene;
  if (checkerType !== 'b') return null;
  const block = [king, ...neighboursOf(king)];
  const covering = new Set<Square>();
  for (const square of block) {
    for (const attacker of after.attackers(square, mover)) {
      if (after.get(attacker)?.type !== 'b') return null;
      covering.add(attacker);
    }
  }
  if (covering.size < 2) return null;
  const files = [...covering].map((square) => Math.sign(fileOf(square) - fileOf(king)));
  const opposite = files.includes(-1) && files.includes(1);
  return { type: opposite ? 'bodenMate' : 'doubleBishopMate', detail: `two bishops on ${[...covering].join(' and ')} cover every square round the king` };
}

/** Queen diagonally next to a king that is not on the edge, the only piece
 * of the mover that covers its two flight squares; the king's remaining
 * neighbours are filled by its own men. */
function dovetail(scene: MateScene): string | null {
  const { king, checker, checkerType, after, mover } = scene;
  if (checkerType !== 'q' || onEdge(king) || distance(checker, king) !== 1) return null;
  if (fileOf(checker) === fileOf(king) || rankOf(checker) === rankOf(king)) return null;
  for (const square of neighboursOf(king)) {
    if (square === checker) continue;
    const attackers = after.attackers(square, mover);
    if (attackers.length === 1 && attackers[0] === checker) {
      if (after.get(square)) return null;
    } else if (attackers.length > 0) return null;
  }
  return `the queen on ${checker} alone covers the king's flight squares`;
}

function claimFor(scene: MateScene, type: MateType, detail: string): TacticClaim {
  return {
    type,
    actor: scene.checker,
    targets: [scene.king],
    victim: null,
    gainKind: 'mate',
    expectedGain: 0,
    prize: null,
    evidence: { arrows: [{ from: scene.checker, to: scene.king }], highlights: neighboursOf(scene.king) },
    detail
  };
}

function shapeDetector(type: MateType, priority: number, read: (scene: MateScene) => string | null): TacticDetector {
  return {
    type,
    priority,
    detect: (ctx) => {
      const scene = sceneOf(ctx);
      const detail = scene && read(scene);
      return scene && detail ? [claimFor(scene, type, detail)] : [];
    }
  };
}

export const anastasiaMateDetector = shapeDetector('anastasiaMate', 1, anastasia);
export const hookMateDetector = shapeDetector('hookMate', 1, hook);
export const arabianMateDetector = shapeDetector('arabianMate', 1, arabian);
export const dovetailMateDetector = shapeDetector('dovetailMate', 1, dovetail);

function bishopMateDetector(type: 'bodenMate' | 'doubleBishopMate'): TacticDetector {
  return shapeDetector(type, 1, (scene) => {
    const found = bishops(scene);
    return found?.type === type ? found.detail : null;
  });
}

export const MATE_SHAPE_DETECTORS: TacticDetector[] = [
  anastasiaMateDetector,
  hookMateDetector,
  arabianMateDetector,
  bishopMateDetector('bodenMate'),
  bishopMateDetector('doubleBishopMate'),
  dovetailMateDetector
];
