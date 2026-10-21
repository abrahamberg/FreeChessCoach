import type { Chess, Square } from 'chess.js';
import type { IdeaContext } from './context.js';
import { attacksFrom, BIG_CENTRE, CENTRE, fewPieces } from './squares.js';
import type { MoveIdea } from './types.js';

/** Past this move the centre is what the middlegame was fought over, not
 * a goal of its own. */
const CENTRE_LAST_MOVE = 25;

export function centreIdeas(context: IdeaContext): MoveIdea[] {
  if (context.fullmove > CENTRE_LAST_MOVE) return [];
  // A bare ending (an endgame study starts at move 1): only a piece brought to the centre counts.
  if (bareEnding(context.before)) return [centralises(context)].filter((idea): idea is MoveIdea => idea !== null);
  return [occupies(context), controls(context), supports(context), strikes(context), centralises(context), givesUp(context)].filter((idea): idea is MoveIdea => idea !== null);
}

/** At most two pieces a side and four pawns in all: no pawn centre left to fight over. */
function bareEnding(board: Chess): boolean {
  return fewPieces(board) && board.board().flat().filter((cell) => cell?.type === 'p').length <= 4;
}

function occupies({ move }: IdeaContext): MoveIdea | null {
  return move.piece === 'p' && CENTRE.includes(move.to) ? { kind: 'occupiesCentre', square: move.to } : null;
}

/** Centre squares the moved man attacks now and did not from where it
 * stood: a pawn's reach counts on the sixteen squares c3–f6 (1.e4 "attacks
 * d5 and f5"), a piece's on the four in the middle. */
function controls(context: IdeaContext): MoveIdea | null {
  const { move } = context;
  // A promotion is about the new queen, not a pawn's reach.
  if (move.piece === 'k' || move.promotion) return null;
  const region = move.piece === 'p' ? BIG_CENTRE : CENTRE;
  const had = new Set(attacksFrom(context.before, move.from));
  const found = newlyAttacked(context).filter((square) => region.includes(square) && !had.has(square));
  if (!found.length) return null;
  const enemyPawn = (square: Square): boolean => context.after.get(square)?.type === 'p' && context.after.get(square)?.color === context.enemy;
  return { kind: 'controlsCentre', squares: found.filter((square) => !enemyPawn(square)).slice(0, 4), pressures: found.filter(enemyPawn) };
}

function newlyAttacked({ after, move }: IdeaContext): Square[] {
  return attacksFrom(after, move.to).filter((square) => {
    const piece = after.get(square);
    return !piece || piece.color !== move.color || piece.type === 'p';
  });
}

/** An own centre pawn the moved man now defends: 5…d6 behind e5. */
function supports({ before, after, move }: IdeaContext): MoveIdea | null {
  const pawn = CENTRE.find((square) => {
    const piece = after.get(square);
    if (piece?.type !== 'p' || piece.color !== move.color || square === move.to) return false;
    return after.attackers(square, move.color).includes(move.to) && !before.attackers(square, move.color).includes(move.from);
  });
  return pawn ? { kind: 'supportsCentre', pawn } : null;
}

/** A pawn move that attacks an enemy centre pawn: the break (…c5 against d4). */
function strikes({ before, after, move, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || move.captured) return null;
  const target = attacksFrom(after, move.to).find((square) => {
    const piece = after.get(square);
    return piece?.type === 'p' && piece.color === enemy && BIG_CENTRE.includes(square) && !before.attackers(square, move.color).includes(move.from);
  });
  return target ? { kind: 'strikesCentre', target } : null;
}

/** A knight, bishop or queen settled on one of the four centre squares,
 * not on its first move (that is development). */
function centralises({ after, move }: IdeaContext): MoveIdea | null {
  if (!['n', 'b', 'q'].includes(move.piece) || !CENTRE.includes(move.to)) return null;
  return { kind: 'centralises', piece: { piece: move.piece, square: move.to }, reach: attacksFrom(after, move.to).length };
}

/** A centre pawn that takes away from the middle: 2…dxc4, 4…exf4. */
function givesUp({ move }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || !move.captured) return null;
  const outward = (move.from[0] === 'd' && move.to[0] === 'c') || (move.from[0] === 'e' && move.to[0] === 'f');
  return outward ? { kind: 'givesUpCentre', from: move.from } : null;
}
