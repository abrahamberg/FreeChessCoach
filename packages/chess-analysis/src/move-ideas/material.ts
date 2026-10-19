import { see } from '../see.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import type { MoveIdea } from './types.js';

/** How much worse than the engine's best a sacrifice may leave the mover
 * and still be one the engine approves (centipawns). */
const SOUND_SACRIFICE_LOSS_CP = 100;
/** What the opponent must win on the square, past what the move took, for
 * the move to give something up (centipawns on `see`'s scale). */
const GIVES_UP_CP = 150;
const PAWN_OFFERED_CP = 100;
/** Past this the mover is losing whatever it does (centipawns, its own view). */
const LOST_CP = 300;

export function materialIdeas(context: IdeaContext): MoveIdea[] {
  return [sacrifices(context), balance(context)].filter((idea): idea is MoveIdea => idea !== null);
}

/** The moved piece can be taken at a loss of material, and the engine
 * still rates the move close to its best: 12…Bxh3, 15.Nxe6. */
function sacrifices({ after, move, enemy, evalBefore, evalAfter }: IdeaContext): MoveIdea | null {
  if (move.piece === 'k') return null;
  const taken = move.captured ? PIECE_VALUES[move.captured] * 100 : 0;
  // A pawn offered is a gambit (2.c4, 2.f4): a pawn's worth is enough.
  if (see(after.fen(), move.to, enemy) - taken < (move.piece === 'p' ? PAWN_OFFERED_CP : GIVES_UP_CP)) return null;
  const best = evalBefore?.lines[0];
  const played = evalAfter?.lines[0];
  if (!best || !played || !sound(best, played, move.color)) return null;
  return { kind: 'sacrifices', piece: { piece: move.piece, square: move.to } };
}

/** White's view in centipawns, a mate as a large number. */
const score = (line: { cp: number | null; mateIn: number | null }): number => (line.mateIn !== null ? Math.sign(line.mateIn) * 100_000 : (line.cp ?? 0));

/** Close to the engine's best, and not lost: in a lost position every move
 * "keeps" the evaluation, and giving up a piece there is desperation. */
function sound(best: { cp: number | null; mateIn: number | null }, played: { cp: number | null; mateIn: number | null }, color: 'w' | 'b'): boolean {
  const sign = color === 'w' ? 1 : -1;
  return sign * score(played) >= sign * score(best) - SOUND_SACRIFICE_LOSS_CP && sign * score(played) > -LOST_CP;
}

/** After a capture that ends an exchange (the engine's reply does not take
 * back on the square), material that is not level: "White has two pawns for
 * the bishop". */
function balance({ move, after, evalAfter }: IdeaContext): MoveIdea | null {
  if (!move.captured) return null;
  // The exchange is over only when the expected reply takes nothing.
  const reply = evalAfter?.lines[0]?.pvSan?.[0];
  if (!reply || reply.includes('x')) return null;
  const counts = new Map<string, number>();
  for (const cell of after.board().flat()) if (cell && cell.type !== 'k') counts.set(cell.type, (counts.get(cell.type) ?? 0) + (cell.color === 'w' ? 1 : -1));
  const level = [...counts.values()].every((count) => count === 0);
  return level ? null : { kind: 'materialBalance', fen: after.fen() };
}


