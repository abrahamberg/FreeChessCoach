import type { Chess, Color, Square } from 'chess.js';
import type { IdeaContext } from './context.js';
import { looseOf } from './memo.js';
import { attacksFrom, fileIndex, isEnding, kingSquare, kingZone, ownRank, pawnCanReach, rankOf, shieldFiles, squareAt } from './squares.js';
import type { MoveIdea, Wing } from './types.js';

export function kingIdeas(context: IdeaContext): MoveIdea[] {
  return [weakensShield(context), guardsKing(context), breaksShield(context), removesDefender(context), joinsAttack(context), flightSquare(context), takesFlightSquare(context), leavesKing(context), stopsCastling(context), losesCastling(context), activatesKing(context)].filter((idea): idea is MoveIdea => idea !== null);
}

/** A king on a wing (castled, or castling there), as the shield's files. */
function wingOf(board: Chess, color: Color): number[] | null {
  const king = kingSquare(board, color);
  if (!king || ownRank(king, color) > 2) return null;
  return shieldFiles(king);
}

/** The wing the king lives on, or will: a king still at home that may
 * castle short has its future shield on f–h. */
function homeWingOf(board: Chess, color: Color): number[] | null {
  const wing = wingOf(board, color);
  if (wing) return wing;
  const rights = board.fen().split(' ')[2] ?? '-';
  return kingSquare(board, color) === (color === 'w' ? 'e1' : 'e8') && rights.includes(color === 'w' ? 'K' : 'k') ? [5, 6, 7] : null;
}

/**
 * A pawn in front of the own king steps forward: the shield is loosened
 * for good, and the squares no pawn of the mover can ever cover again are
 * named (9.h3 in game 1; 12.g3 left f3 and h3 to the bishop).
 */
function weakensShield({ before, after, move, enemy }: IdeaContext): MoveIdea | null {
  // Without the enemy queen there is no attack on the king to fear: in the
  // ending the pawns in front of the king may move freely.
  if (move.piece !== 'p' || before.findPiece({ type: 'q', color: enemy }).length === 0) return null;
  const files = homeWingOf(before, move.color);
  if (!files || !files.includes(fileIndex(move.from)) || ownRank(move.from, move.color) !== 2) return null;
  const holes: Square[] = [];
  for (const file of files) {
    for (const rank of [3, 4]) {
      const square = squareAt(file, move.color === 'w' ? rank : 9 - rank);
      if (square && pawnCanReach(before, move.color, square) && !pawnCanReach(after, move.color, square)) holes.push(square);
    }
  }
  return { kind: 'weakensShield', pawn: move.to, holes };
}

/** A knight to f3 (f6), the best defender of a king castled short, with
 * its king there or still able to go there. */
function guardsKing({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'n' || move.to !== (move.color === 'w' ? 'f3' : 'f6')) return null;
  const files = homeWingOf(after, move.color);
  return files?.includes(6) ? { kind: 'guardsKing', piece: { piece: 'n', square: move.to } } : null;
}

/** A capture of a pawn in front of the enemy king. */
function breaksShield({ before, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.captured !== 'p') return null;
  const files = wingOf(before, enemy);
  const king = kingSquare(before, enemy);
  if (!files || !king || !files.includes(fileIndex(move.to)) || Math.abs(rankOf(move.to) - rankOf(king)) > 2) return null;
  return { kind: 'breaksShield', pawn: move.to };
}

/** The captured piece was guarding the enemy king (two squares around it
 * at least, the knight on f6 of every kingside attack) or was the one
 * guard of another enemy man, now loose. */
function removesDefender({ before, after, move, enemy }: IdeaContext): MoveIdea | null {
  if (!move.captured || move.captured === 'p') return null;
  const captured = { piece: move.captured, square: move.to };
  const zone = new Set(kingZone(before, enemy));
  if (wingOf(before, enemy) && attacksFrom(before, move.to).filter((square) => zone.has(square)).length >= 2) return { kind: 'removesDefender', piece: captured, guarded: 'king' };
  const had = new Set(looseOf(before.fen(), enemy).map((piece) => piece.square));
  const exposed = looseOf(after.fen(), enemy).find((piece) => !had.has(piece.square) && before.attackers(piece.square, enemy).includes(move.to));
  return exposed ? { kind: 'removesDefender', piece: captured, guarded: { piece: exposed.piece, square: exposed.square } } : null;
}

/** A piece that now bears on two or more squares around a castled enemy
 * king, where it bore on fewer. */
function joinsAttack({ before, after, move, enemy, fullmove }: IdeaContext): MoveIdea | null {
  if (move.piece === 'p' || move.piece === 'k' || fullmove < 6 || !wingOf(after, enemy)) return null;
  const zone = new Set(kingZone(after, enemy));
  const now = attacksFrom(after, move.to).filter((square) => zone.has(square)).length;
  const was = attacksFrom(before, move.from).filter((square) => zone.has(square)).length;
  return now >= 2 && now > was ? { kind: 'joinsAttack', piece: { piece: move.piece, square: move.to }, kingSquares: now } : null;
}

/** The own king had no square to go to and now has one (luft, or a rook
 * that steps off f8). */
function flightSquare({ before, again, move }: IdeaContext): MoveIdea | null {
  if (!again || move.piece === 'k' || before.inCheck()) return null;
  // The king still on its first square has castling ahead: e2 after 1.e4 is no flight square.
  const king = kingSquare(before, move.color);
  if (!king || king[0] === 'e') return null;
  const was = new Set(before.moves({ piece: 'k', verbose: true }).map((each) => each.to));
  if (was.size > 0) return null;
  const now = again.moves({ piece: 'k', verbose: true }).filter((each) => !each.flags.includes('k') && !each.flags.includes('q'));
  const square = now[0]?.to;
  return square ? { kind: 'flightSquare', square } : null;
}

/** A square next to a castled enemy king that the moved man now covers and
 * the king could go to before: 17…Bxf2 takes g1. */
function takesFlightSquare({ enemyBefore, after, move, enemy }: IdeaContext): MoveIdea | null {
  if (!enemyBefore || move.piece === 'k' || !wingOf(after, enemy)) return null;
  const could = new Set(enemyBefore.moves({ piece: 'k', verbose: true }).map((each) => each.to));
  const can = new Set(after.moves({ piece: 'k', verbose: true }).map((each) => each.to));
  // Said where it tightens a net: the king left with one square at most, or in check.
  if (can.size > 1 && !after.inCheck()) return null;
  const square = attacksFrom(after, move.to).find((each) => could.has(each) && !can.has(each));
  return square ? { kind: 'takesFlightSquare', square } : null;
}

/** A piece that guarded two or more squares around its own castled king
 * and moves (or is traded) away from it: 11.Nxe5 took the f3-knight, "the
 * best defender of the castled position", off the board. */
function leavesKing({ before, after, move }: IdeaContext): MoveIdea | null {
  if (!['n', 'b', 'q'].includes(move.piece) || !wingOf(before, move.color)) return null;
  const king = kingSquare(before, move.color);
  const zone = new Set(kingZone(before, move.color).filter((square) => square !== king));
  const was = attacksFrom(before, move.from).filter((square) => zone.has(square)).length;
  const now = attacksFrom(after, move.to).filter((square) => zone.has(square)).length;
  return was >= 2 && now === 0 ? { kind: 'leavesKing', piece: { piece: move.piece, square: move.from } } : null;
}

/** The moved man now covers a square the enemy king must cross to castle. */
function stopsCastling({ before, after, move, enemy }: IdeaContext): MoveIdea | null {
  // A piece the opponent can take stops nothing for long.
  if (after.attackers(move.to, enemy).length > 0) return null;
  const rights = after.fen().split(' ')[2] ?? '-';
  const rank = enemy === 'w' ? 1 : 8;
  const wings: [Wing, string, string[]][] = [
    ['kingside', enemy === 'w' ? 'K' : 'k', ['f', 'g']],
    ['queenside', enemy === 'w' ? 'Q' : 'q', ['d', 'c']]
  ];
  for (const [wing, right, files] of wings) {
    if (!rights.includes(right)) continue;
    const square = files.map((file) => `${file}${rank}` as Square).find((each) => after.attackers(each, move.color).includes(move.to) && !before.isAttacked(each, move.color));
    if (square) return { kind: 'stopsCastling', wing, square };
  }
  return null;
}

/** A king move (not castling) that gives up castling for good. */
function losesCastling({ fenBefore, move, before }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'k' || move.flags.includes('k') || move.flags.includes('q') || isEnding(before)) return null;
  const rights = fenBefore.split(' ')[2] ?? '-';
  return (move.color === 'w' ? /[KQ]/ : /[kq]/).test(rights) ? { kind: 'losesCastling' } : null;
}


/** In the ending, a king that steps toward the centre or into the enemy
 * half: there the king is a fighting piece. */
function activatesKing({ move, before }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'k' || move.flags.includes('k') || move.flags.includes('q') || !isEnding(before)) return null;
  const toCentre = (square: Square): number => Math.max(Math.abs(fileIndex(square) - 3.5), Math.abs(rankOf(square) - 4.5));
  const invades = ownRank(move.to, move.color) >= 5 && ownRank(move.from, move.color) < ownRank(move.to, move.color);
  return toCentre(move.to) < toCentre(move.from) || invades ? { kind: 'activatesKing', square: move.to, invades } : null;
}
