import { Chess, type Square } from 'chess.js';
import { toColorName } from '../attack-map.js';
import { pawnStructure } from '../pawn-structure.js';
import { pieceNameAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The two "this square is worth having" motifs — a rook taking a file with no
 * pawns on it, and a minor piece landing where no enemy pawn can ever chase
 * it away. Same file because both are answered by the same question about a
 * single destination square, from the same `pawnStructure` scan.
 */
export const seizesOpenFileDetector: TacticDetector = {
  type: 'seizesOpenFile',
  priority: 97,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move) return [];
    if (ctx.move.piece !== 'r' && ctx.move.piece !== 'q') return [];
    const file = ctx.destination[0]!;
    if (ctx.move.from[0] === file) return [];

    const structure = pawnStructure(ctx.after);
    const open = structure.openFiles.includes(file);
    const halfOpen = structure.semiOpenFiles.some((entry) => entry.file === file && entry.openFor === toColorName(ctx.mover));
    if (!open && !halfOpen) return [];

    const claim: TacticClaim = {
      type: 'seizesOpenFile',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: `takes the ${open ? 'open' : 'half-open'} ${file}-file with the ${pieceNameAt(ctx.after, ctx.destination)}`
    };
    return [claim];
  }
};

export const outpostDetector: TacticDetector = {
  type: 'outpost',
  priority: 95,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination || !ctx.move) return [];
    if (ctx.move.piece !== 'n' && ctx.move.piece !== 'b') return [];
    if (!isInEnemyHalf(ctx.destination, ctx.mover)) return [];
    if (!isPawnDefended(ctx.after, ctx.destination, ctx.mover)) return [];
    if (canBeChasedByPawn(ctx.after, ctx.destination, ctx.opponent)) return [];

    const claim: TacticClaim = {
      type: 'outpost',
      actor: ctx.destination,
      targets: [],
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: [ctx.destination] },
      detail: `plants the ${pieceNameAt(ctx.after, ctx.destination)} on ${ctx.destination}, where no pawn can chase it`
    };
    return [claim];
  }
};

function isInEnemyHalf(square: Square, mover: 'w' | 'b'): boolean {
  const rank = Number(square[1]);
  return mover === 'w' ? rank >= 5 : rank <= 4;
}

/** Defended by one of the mover's own pawns — the half that makes an outpost
 * a fixture rather than a visit. */
function isPawnDefended(chess: Chess, square: Square, mover: 'w' | 'b'): boolean {
  return chess
    .attackers(square, mover)
    .some((attacker) => chess.get(attacker)?.type === 'p');
}

/** Could an enemy pawn ever come and hit this square? Only the two files
 * either side matter, and only pawns still behind the square on them. */
function canBeChasedByPawn(chess: Chess, square: Square, opponent: 'w' | 'b'): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);

  for (const df of [-1, 1]) {
    const neighbourFile = file + df;
    if (neighbourFile < 0 || neighbourFile > 7) continue;
    for (let candidateRank = 2; candidateRank <= 7; candidateRank++) {
      const candidate = (String.fromCharCode(97 + neighbourFile) + String(candidateRank)) as Square;
      const piece = chess.get(candidate);
      if (piece?.type !== 'p' || piece.color !== opponent) continue;
      const canStillAdvance = opponent === 'w' ? candidateRank < rank : candidateRank > rank;
      if (canStillAdvance) return true;
    }
  }
  return false;
}
