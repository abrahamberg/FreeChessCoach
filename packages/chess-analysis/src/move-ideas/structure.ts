import { Chess, type Color, type Square } from 'chess.js';
import { createdPassedPawns, pawnStructure } from '../pawn-structure.js';
import type { IdeaContext } from './context.js';
import { attacksFrom, fileIndex, kingSquare, NATURAL_KNIGHT_SQUARES, ownRank, pawnCanReach, rankOf, shieldFiles, squareAt } from './squares.js';
import type { Move } from 'chess.js';
import type { MoveIdea, Wing } from './types.js';

export function structureIdeas(context: IdeaContext): MoveIdea[] {
  return [outpostOrHole(context), blockades(context), pawnStorm(context), passedPawn(context), ...weaknesses(context), forcesWeakness(context), gainsSpace(context), fixesPawn(context), majority(context)].filter((idea): idea is MoveIdea => idea !== null);
}

const distance = (a: Square, b: Square): number => Math.max(Math.abs(fileIndex(a) - fileIndex(b)), Math.abs(rankOf(a) - rankOf(b)));

/** A piece on a square no enemy pawn can ever attack: beside the enemy
 * king it is a hole the pawns left (h6 after …g6), elsewhere in the enemy
 * half an outpost (the knight on e5). */
function outpostOrHole({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece === 'p' || move.piece === 'k' || ownRank(move.to, move.color) < 4) return null;
  // With no enemy pawns every square is out of their reach: nothing to say.
  if (!after.board().flat().some((cell) => cell?.type === 'p' && cell.color === enemy)) return null;
  const secure = !pawnCanReach(after, enemy, move.to);
  const piece = { piece: move.piece, square: move.to };
  const king = kingSquare(after, enemy);
  if (secure && king && distance(king, move.to) <= 2 && ownRank(move.to, move.color) >= 6) return { kind: 'occupiesHole', piece, nearKing: true };
  if (move.piece === 'q' || ownRank(move.to, move.color) > 6 || fileIndex(move.to) < 1 || fileIndex(move.to) > 6) return null;
  const support = after.attackers(move.to, move.color).find((square) => after.get(square)?.type === 'p') ?? null;
  // Without a pawn behind it a square some pawn can still reach is only a
  // square; with one, and no pawn on it yet, it is still a strong post (Ne5 on d4's back).
  const attackedByPawn = after.attackers(move.to, enemy).some((square) => after.get(square)?.type === 'p');
  if (!secure && (!support || attackedByPawn || ownRank(move.to, move.color) < 5)) return null;
  return { kind: 'outpost', piece, supportedBy: support, secure };
}

/** A piece on the square in front of an enemy passed or isolated pawn. */
function blockades({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece === 'p' || move.piece === 'k') return null;
  const behind = squareAt(fileIndex(move.to), rankOf(move.to) + (enemy === 'w' ? -1 : 1));
  const pawn = behind ? after.get(behind) : undefined;
  if (!behind || pawn?.type !== 'p' || pawn.color !== enemy) return null;
  const structure = pawnStructure(after);
  const owner = enemy === 'w' ? 'white' : 'black';
  // A passed pawn anywhere; an isolated one only in the centre, where it is the target (the isolated d-pawn).
  const centreIsolated = structure.isolatedPawns.filter((each) => ['c', 'd', 'e', 'f'].includes(String(each.square)[0] ?? ''));
  const weak = [...structure.passedPawns, ...centreIsolated].some((each) => each.square === behind && each.color === owner);
  return weak ? { kind: 'blockades', pawn: behind } : null;
}

/** A pawn marching at the enemy king's wing while the own king is away from it. */
function pawnStorm({ after, move, enemy, fullmove }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || ownRank(move.to, move.color) < 4 || fullmove < 6) return null;
  // A passed pawn's push is said as that (`passedPawn`).
  const owner = move.color === 'w' ? 'white' : 'black';
  if (pawnStructure(after).passedPawns.some((pawn) => pawn.square === move.to && pawn.color === owner)) return null;
  const king = kingSquare(after, enemy);
  if (!king || ownRank(king, enemy) > 2 || Math.abs(fileIndex(king) - fileIndex(move.to)) > 1 || !shieldFiles(king)) return null;
  // Beside its own king a pawn on the fourth is making room, not storming.
  const own = kingSquare(after, move.color);
  if (own && Math.abs(fileIndex(own) - fileIndex(move.to)) <= 2 && ownRank(move.to, move.color) < 5) return null;
  return { kind: 'pawnStorm', pawn: move.to };
}

/** A passed pawn made, or pushed on. */
function passedPawn({ fenBefore, after, move }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p') return null;
  const owner = move.color === 'w' ? 'white' : 'black';
  const before = pawnStructure(new Chess(fenBefore)).passedPawns;
  const now = pawnStructure(after).passedPawns;
  const created = createdPassedPawns(before, now, move);
  const toGo = 8 - ownRank(move.to, move.color);
  if (created.includes(move.to)) return { kind: 'passedPawn', square: move.to, created: true, toGo };
  if (now.some((pawn) => pawn.square === move.to && pawn.color === owner) && !move.captured) return { kind: 'passedPawn', square: move.to, created: false, toGo };
  return null;
}

/** Doubled or isolated pawns the move leaves, on either side. */
function weaknesses({ fenBefore, after, move }: IdeaContext): MoveIdea[] {
  if (!move.captured && move.piece !== 'p') return [];
  const was = pawnStructure(new Chess(fenBefore));
  const now = pawnStructure(after);
  const ideas: MoveIdea[] = [];
  for (const color of ['w', 'b'] as Color[]) {
    const name = color === 'w' ? 'white' : 'black';
    const doubled = now.doubledPawns.filter((each) => each.color === name && !was.doubledPawns.some((old) => old.color === name && old.file === each.file));
    if (doubled.length) ideas.push({ kind: 'pawnWeakness', owner: name, weakness: 'doubled', where: doubled.map((each) => String(each.file)) });
    // By file: a pawn pushed up an isolated file is not a new weakness.
    const isolated = now.isolatedPawns.filter((each) => each.color === name && !was.isolatedPawns.some((old) => old.color === name && String(old.square)[0] === String(each.square)[0]));
    if (isolated.length) ideas.push({ kind: 'pawnWeakness', owner: name, weakness: 'isolated', where: isolated.map((each) => String(each.square)) });
  }
  return ideas;
}

/** A centre pawn on the fifth rank that takes a square from an enemy knight
 * still at home: 4.e5 and the knight cannot come to f6. */
function gainsSpace({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || move.captured || ownRank(move.to, move.color) !== 5 || !['c', 'd', 'e', 'f'].includes(move.to[0] ?? '')) return null;
  if (after.moves({ verbose: true }).some((each) => each.to === move.to && each.captured)) return null;
  const taken = attacksFrom(after, move.to).find((square) => NATURAL_KNIGHT_SQUARES.has(square) && (after.get(square)?.type === 'n' || hasKnightAtHome(after, enemy, square)));
  return { kind: 'gainsSpace', square: move.to, cramps: taken ? 'n' : null };
}

function hasKnightAtHome(board: Chess, color: Color, natural: Square): boolean {
  const home = `${natural[0] === 'c' ? 'b' : 'g'}${color === 'w' ? 1 : 8}` as Square;
  const piece = board.get(home);
  return piece?.type === 'n' && piece.color === color;
}

/** A capture whose expected recapture (the engine's reply) leaves the
 * opponent doubled or isolated pawns: 7…Bxc3+ and bxc3. */
function forcesWeakness({ move, evalAfter, enemy }: IdeaContext): MoveIdea | null {
  const reply = evalAfter?.lines[0]?.pvSan?.[0];
  if (!move.captured || !reply) return null;
  let answered: Move;
  try {
    answered = new Chess(move.after).move(reply);
  } catch {
    return null;
  }
  if (answered.piece !== 'p' || answered.to !== move.to) return null;
  const owner = enemy === 'w' ? 'white' : 'black';
  const was = pawnStructure(new Chess(move.after));
  const now = pawnStructure(new Chess(answered.after));
  const doubled = now.doubledPawns.filter((each) => each.color === owner && !was.doubledPawns.some((old) => old.color === owner && old.file === each.file));
  if (doubled.length) return { kind: 'forcesWeakness', reply: answered.san, weakness: 'doubled', where: doubled.map((each) => String(each.file)) };
  const isolated = now.isolatedPawns.filter((each) => each.color === owner && !was.isolatedPawns.some((old) => old.color === owner && old.square === each.square));
  return isolated.length ? { kind: 'forcesWeakness', reply: answered.san, weakness: 'isolated', where: isolated.map((each) => String(each.square)) } : null;
}

/** A pawn that steps right in front of an enemy pawn and stops it for good:
 * 21.a4 against a5, a fixed target from then on. */
function fixesPawn({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || move.captured) return null;
  const ahead = squareAt(fileIndex(move.to), rankOf(move.to) + (move.color === 'w' ? 1 : -1));
  const pawn = ahead ? after.get(ahead) : undefined;
  return ahead && pawn?.type === 'p' && pawn.color === enemy && ownRank(ahead, enemy) >= 4 ? { kind: 'fixesPawn', pawn: ahead } : null;
}

const WINGS: [Wing, number[]][] = [['queenside', [0, 1, 2]], ['kingside', [5, 6, 7]]];

/** A trade that leaves the mover more pawns than the opponent on a wing
 * where it had none to spare: the majority that makes a passed pawn. */
function majority({ fenBefore, after, move, enemy, fullmove }: IdeaContext): MoveIdea | null {
  // A majority is an asset for the ending: in the opening's tactics it is noise.
  if (!move.captured || fullmove < 15 || after.inCheck()) return null;
  const count = (board: Chess, color: Color, files: number[]): number => board.findPiece({ type: 'p', color }).filter((square) => files.includes(fileIndex(square))).length;
  const before = new Chess(fenBefore);
  for (const [wing, files] of WINGS) {
    const own = count(after, move.color, files);
    const theirs = count(after, enemy, files);
    if (own > theirs && count(before, move.color, files) <= count(before, enemy, files)) return { kind: 'majority', wing, own, theirs };
  }
  return null;
}
