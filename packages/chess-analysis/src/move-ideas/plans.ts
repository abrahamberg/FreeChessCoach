import { Chess, type Move, type Square } from 'chess.js';
import { CONFIG } from '../config.js';
import { see } from '../see.js';
import type { IdeaContext } from './context.js';
import { attacksFrom, BIG_CENTRE, fileIndex, ownRank, pawnCanReach, rankOf, squareAt } from './squares.js';
import type { MoveIdea } from './types.js';

const { minThreatSeeCp: MIN_WON_SEE_CP } = CONFIG.evalWitness;

/**
 * The mover's next move on the engine's line, when this move is what made
 * it possible or safe: c3 so that d4 is supported, b6 so that the bishop
 * can come to b7. Only quiet next moves: a capture or check the move set up
 * is a threat (`threats.ts`).
 */
export function planIdeas(context: IdeaContext): MoveIdea[] {
  return [...enginePlan(context), preparesPush(context), preparesFianchetto(context), eyesOutpost(context)].filter((idea): idea is MoveIdea => idea !== null);
}

function enginePlan({ fenBefore, move, evalAfter }: IdeaContext): MoveIdea[] {
  const [reply, next] = evalAfter?.lines[0]?.pvSan ?? [];
  if (!reply || !next) return [];
  const board = new Chess(move.after);
  let planned: Move;
  try {
    board.move(reply);
    planned = board.move(next);
  } catch {
    return [];
  }
  if (planned.captured || planned.san.includes('+') || planned.from === move.to) return [];
  const how = howPrepared(fenBefore, move, planned);
  return how ? [{ kind: 'prepares', san: planned.san, how }] : [];
}

function howPrepared(fenBefore: string, move: Move, planned: Move): 'supports' | 'clears' | 'opens' | null {
  const earlier = playedEarlier(fenBefore, planned);
  if (!earlier) {
    if (planned.to === move.from || (planned.flags.includes('k') || planned.flags.includes('q'))) return 'clears';
    if (between(planned.from, planned.to).includes(move.from)) return 'opens';
    return null;
  }
  const lostThen = see(earlier.after, earlier.to as Square, move.color === 'w' ? 'b' : 'w') >= MIN_WON_SEE_CP;
  const safeNow = see(planned.after, planned.to as Square, move.color === 'w' ? 'b' : 'w') < MIN_WON_SEE_CP;
  const covers = new Chess(planned.after).attackers(planned.to as Square, move.color).includes(move.to);
  return lostThen && safeNow && covers ? 'supports' : null;
}

/** The planned move played straight away instead, or null when it was not legal then. */
function playedEarlier(fenBefore: string, planned: Move): Move | null {
  try {
    return new Chess(fenBefore).move({ from: planned.from, to: planned.to, promotion: planned.promotion });
  } catch {
    return null;
  }
}

/** The squares strictly between two on a line, empty for a knight's jump. */
function between(from: Square, to: Square): Square[] {
  const df = Math.sign(fileIndex(to) - fileIndex(from));
  const dr = Math.sign(rankOf(to) - rankOf(from));
  const steps = Math.max(Math.abs(fileIndex(to) - fileIndex(from)), Math.abs(rankOf(to) - rankOf(from)));
  const straight = fileIndex(to) === fileIndex(from) || rankOf(to) === rankOf(from) || Math.abs(fileIndex(to) - fileIndex(from)) === Math.abs(rankOf(to) - rankOf(from));
  if (!straight) return [];
  return Array.from({ length: Math.max(0, steps - 1) }, (_, index) => `${'abcdefgh'[fileIndex(from) + df * (index + 1)]}${rankOf(from) + dr * (index + 1)}` as Square);
}

/** The move newly covers a centre square the opponent contests, where an
 * own pawn can step next: 1…e6 for …d5, c3 for d4, …Nbd7 for …c5. */
function preparesPush({ before, after, move, enemy }: IdeaContext): MoveIdea | null {
  const covers = new Set(attacksFrom(after, move.to).filter((square) => !attacksFrom(before, move.from).includes(square)));
  for (const pawn of after.findPiece({ type: 'p', color: move.color })) {
    if (pawn === move.to) continue;
    const forward = move.color === 'w' ? 1 : -1;
    const steps = ownRank(pawn, move.color) === 2 ? [1, 2] : [1];
    for (const step of steps) {
      const to = squareAt(fileIndex(pawn), rankOf(pawn) + forward * step);
      if (!to || after.get(to) || (step === 2 && after.get(squareAt(fileIndex(pawn), rankOf(pawn) + forward) ?? to))) break;
      if (BIG_CENTRE.includes(to) && covers.has(to) && after.isAttacked(to, enemy)) return { kind: 'preparesPush', pawn, to };
    }
  }
  return null;
}

/** A b- or g-pawn step that opens the fianchetto square to a bishop still at home. */
function preparesFianchetto({ after, move }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || move.captured) return null;
  const rank = move.color === 'w' ? 2 : 7;
  const home = move.color === 'w' ? 1 : 8;
  const pairs: [string, string][] = [['b', 'c'], ['g', 'f']];
  for (const [file, bishopFile] of pairs) {
    if (move.from !== `${file}${rank}`) continue;
    const bishop = `${bishopFile}${home}` as Square;
    const piece = after.get(bishop);
    if (piece?.type === 'b' && piece.color === move.color) return { kind: 'preparesFianchetto', bishop, to: `${file}${rank}` as Square };
  }
  return null;
}

/** A knight one jump from an empty square in the enemy half that no enemy
 * pawn can ever attack: 8.Ng3 heading for f5. */
function eyesOutpost({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'n') return null;
  const square = attacksFrom(after, move.to).find((each) => {
    const rank = ownRank(each, move.color);
    // The square it just came from is no destination (27…Ne2 "heads for c3").
    return each !== move.from && rank >= 5 && rank <= 6 && fileIndex(each) >= 2 && fileIndex(each) <= 5 && !after.get(each) && !pawnCanReach(after, enemy, each);
  });
  return square ? { kind: 'eyesOutpost', piece: { piece: 'n', square: move.to }, square } : null;
}
