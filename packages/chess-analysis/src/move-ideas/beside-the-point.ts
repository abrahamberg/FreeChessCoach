import type { EngineEval } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { indexOf } from '../fast-board/board.js';
import { seeOnBoard } from '../see.js';
import { toCpWhite, winPctWhite } from '../win-probability.js';
import type { IdeaContext } from './context.js';
import type { MoveIdea, MoveIdeaKind } from './types.js';

/** True but small: what a coach says about a balanced game, not a decided
 * one. Threats, mates, material, tactics, the king's safety, development,
 * castling and passed pawns are never in it. */
const SMALL_KINDS: ReadonlySet<MoveIdeaKind> = new Set([
  'occupiesCentre', 'controlsCentre', 'supportsCentre', 'strikesCentre', 'centralises', 'givesUpCentre', 'gainsSpace',
  'opensLine', 'shutsIn', 'opensEnemyLine', 'longDiagonal', 'aimsAt', 'rookFile', 'rookToCentre', 'connectsRooks', 'opensFile', 'fianchetto', 'doubles', 'seventhRank',
  'outpost', 'occupiesHole', 'eyesOutpost', 'pawnStorm', 'pawnWeakness', 'forcesWeakness', 'majority', 'fixesPawn',
  'takesFlightSquare', 'restricts', 'recapturesTowardCentre', 'bishopPair', 'preparesPush', 'preparesFianchetto'
]);

/** What the moved man does from the square it went to: nothing, once the
 * engine's reply takes it there (11…Nxd2 Nxd2 "controls e4"). A pawn's
 * strike at the centre is made to be taken (2.f4 exf4). */
const STANDING_KINDS: ReadonlySet<MoveIdeaKind> = new Set([
  'occupiesCentre', 'controlsCentre', 'supportsCentre', 'centralises', 'gainsSpace', 'longDiagonal', 'rookFile', 'rookToCentre', 'seventhRank',
  'outpost', 'occupiesHole', 'eyesOutpost', 'blockades', 'fixesPawn', 'pilesOn', 'prevents', 'takesFlightSquare', 'joinsAttack', 'guardsKing'
]);

/**
 * The ideas a coach would say: no small positional idea once the game is
 * decided (36.Rxe6 at +7 "puts the rook on an outpost") or once the move
 * loses the game's balance (31…Qxd3 dropping a piece "opens the bishop"),
 * and nothing about where the moved man stands when it is taken at once.
 * Wrong for Game Review and the course dossier alike.
 */
export function withoutBesideThePoint(ideas: readonly MoveIdea[], context: IdeaContext): MoveIdea[] {
  const small = smallIdeasAreClutter(context.evalBefore, context.evalAfter, context.mover, context.move.san);
  const taken = takenAtOnce(context);
  const gone = taken && isGone(context);
  return ideas.filter((idea) => {
    if (small && (SMALL_KINDS.has(idea.kind) || isSmallPrevention(idea))) return false;
    if (!taken || !isOfMovedMan(idea, context)) return true;
    // Once it is taken, what the move stopped is possible again (2.d4 cxd4
    // "prevents …e5"), and the pawns it doubled are not (3…exd4 Nxd4).
    return idea.kind !== 'prevents' && !doubledByMovedPawn(idea, context) && !(gone && STANDING_KINDS.has(idea.kind));
  });
}

function doubledByMovedPawn(idea: MoveIdea, { move }: IdeaContext): boolean {
  const mover = move.color === 'w' ? 'white' : 'black';
  return idea.kind === 'pawnWeakness' && idea.weakness === 'doubled' && idea.owner === mover && move.piece === 'p' && idea.where.includes(move.to[0] ?? '');
}

/** A piece taken at once stands nowhere; a pawn traded evenly leaves its
 * place (2.d4 cxd4 Qxd4 still "puts a pawn in the centre"), one simply lost
 * does not (14…c6 dxc6 "puts pressure on d5"). */
function isGone({ move, fast }: IdeaContext): boolean {
  return move.piece !== 'p' || seeOnBoard(fast.after, indexOf(move.to)) > 0;
}

/** A pawn's advance or a knight's square stopped is a balanced game's point. */
function isSmallPrevention(idea: MoveIdea): boolean {
  return idea.kind === 'prevents' && (idea.because === 'advance' || idea.because === 'outpost');
}

/** The mover's win% in the engine's first line of `evaluation`. */
function moverWinPct(evaluation: EngineEval | undefined, mover: 'w' | 'b'): number | null {
  const line = evaluation?.lines[0];
  if (!line) return null;
  const white = winPctWhite(toCpWhite(line));
  return mover === 'w' ? white : 100 - white;
}

/** The small positional ideas are clutter: the game is decided before the
 * move (either side past the severity's damping win%, about +6, or a forced
 * mate), or the move is a blunder, giving away more win% than a mistake
 * does. Also what keeps Game Review's principle notes ("puts the rook on the
 * d-file") from saying them instead. */
export function smallIdeasAreClutter(evalBefore: EngineEval | undefined, evalAfter: EngineEval | undefined, mover: 'w' | 'b', playedSan: string): boolean {
  const before = moverWinPct(evalBefore, mover);
  if (before === null) return false;
  const { dampingHighWin, dampingLowWin, mistakeMaxDrop } = CONFIG.severity;
  if (before >= dampingHighWin || before <= dampingLowWin) return true;
  // The engine's own move is no blunder, whatever a second search says (19…Qxa1+).
  if (evalBefore?.lines[0]?.moveSan === playedSan) return false;
  const after = moverWinPct(evalAfter, mover);
  return after !== null && before - after > mistakeMaxDrop;
}

/** The engine's reply captures on the square the move went to. */
function takenAtOnce({ evalAfter, move }: IdeaContext): boolean {
  const reply = evalAfter?.lines[0]?.pvSan?.[0];
  return reply !== undefined && /x([a-h][1-8])/.exec(reply)?.[1] === move.to;
}

/** The idea is about the moved man (a line piece named elsewhere is not). */
function isOfMovedMan(idea: MoveIdea, { move }: IdeaContext): boolean {
  return 'piece' in idea && typeof idea.piece === 'object' ? idea.piece.square === move.to : true;
}
