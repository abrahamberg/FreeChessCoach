import type { Chess, Color, Move, Square } from 'chess.js';
import { colorOf, indexOf, squareOf, symbolOf } from '../fast-board/board.js';
import { hasLegalMove, isMate, legalMoves } from '../fast-board/moves.js';
import { kickTarget } from '../kick-reason.js';
import { see } from '../see.js';
import { pinShapes } from '../tactic-pins.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import { looseAt, pinsOf } from './memo.js';
import { mateThreat } from './mates.js';
import { attacksFrom, pieceAt } from './squares.js';
import { threatNet } from './threat-nets.js';
import type { MoveIdea } from './types.js';

/** What the move threatens to do next, were it the mover's turn again. */
export function threatIdeas(context: IdeaContext): MoveIdea[] {
  return [threatensMate(context), threatensMaterial(context), pilesOn(context), pinnedCannotTake(context), newPin(context), keepsPin(context), leavesPinned(context), kicks(context), restricts(context)].filter((idea): idea is MoveIdea => idea !== null);
}

/** A mate the mover would have next move, which it did not have before. */
function threatensMate({ fast }: IdeaContext): MoveIdea | null {
  if (!fast.again || !hasLegalMove(fast.after)) return null;
  const line = mateThreat(fast.again);
  if (!line) return null;
  const had = mateThreat(fast.before);
  return had && had[0] === line[0] ? null : { kind: 'threatensMate', line };
}

/** The most valuable enemy piece the move makes winnable (`loosePieces`, at
 * least a pawn's worth on `see`) that was not before, and whose capture
 * really nets it (`threatNet`). */
function threatensMaterial({ fenBefore, before, after, again, enemy, move, fast }: IdeaContext): MoveIdea | null {
  const changed = again ? pressureChanged(before, after, enemy, move.color) : [];
  if (!again || !fast.again || changed.length === 0) return null;
  const had = new Set(looseAt(fenBefore, enemy, changed).map((piece) => piece.square));
  const targets = looseAt(after.fen(), enemy, changed)
    .filter((piece) => !had.has(piece.square))
    .sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece]);
  for (const target of targets) {
    const capture = cheapestCapture(again, target.square);
    const net = capture ? threatNet(fast.after, fast.again, capture) : null;
    if (capture && net) return { kind: 'threatensMaterial', san: capture.san, target: { piece: target.piece, square: target.square }, givesBack: net.givesBack };
  }
  return null;
}

/** The cheapest legal capture on `square`: only its attackers generate moves. */
function cheapestCapture(board: Chess, square: Square): Move | null {
  const captures = board.attackers(square, board.turn()).flatMap((from) => board.moves({ square: from, verbose: true }).filter((each) => each.to === square && each.captured));
  return captures.sort((a, b) => PIECE_VALUES[a.piece] - PIECE_VALUES[b.piece])[0] ?? null;
}

/** The enemy men that gained an attacker or lost a defender: the only ones
 * the move can have made newly winnable (`loosePieces` is costly). */
function pressureChanged(before: Chess, after: Chess, owner: Color, attacker: Color): Square[] {
  return after.board().flat().flatMap((cell) => {
    if (!cell || cell.color !== owner || cell.type === 'k') return [];
    const was = before.get(cell.square);
    if (was?.type !== cell.type || was.color !== owner) return [cell.square];
    const more = after.attackers(cell.square, attacker).length > before.attackers(cell.square, attacker).length;
    const fewer = after.attackers(cell.square, owner).length < before.attackers(cell.square, owner).length;
    return more || fewer ? [cell.square] : [];
  });
}

/** The moved piece joins the attackers of an enemy man that now has as
 * many attackers as defenders or more (two at least): "attacks the pawn on
 * g4 a third time". */
function pilesOn({ after, before, move, enemy }: IdeaContext): MoveIdea | null {
  let best: { square: Square; attackers: number; defenders: number } | null = null;
  for (const square of attacksFrom(after, move.to)) {
    const piece = after.get(square);
    if (!piece || piece.color !== enemy || piece.type === 'k') continue;
    if (before.attackers(square, move.color).includes(move.from)) continue;
    const attackers = after.attackers(square, move.color).length;
    const defenders = after.attackers(square, enemy).length;
    if (attackers < 2 || attackers <= defenders) continue;
    if (!best || attackers > best.attackers) best = { square, attackers, defenders };
  }
  const target = best ? pieceAt(after, best.square) : null;
  return best && target ? { kind: 'pilesOn', target, attackers: best.attackers, defenders: best.defenders } : null;
}

/** The moved piece stands where an enemy man attacks it but cannot take,
 * because it is pinned: 13…Qg3+ and the f2-pawn may not take. */
function pinnedCannotTake({ after, move, enemy, fast }: IdeaContext): MoveIdea | null {
  const attackers = after.attackers(move.to, enemy);
  if (attackers.length === 0 || isMate(fast.after)) return null;
  const target = indexOf(move.to);
  const legal = new Set(attackers.filter((from) => legalMoves(fast.after, indexOf(from)).some((each) => each.to === target)));
  for (const attacker of attackers) {
    // A king that may not take is guarded against, not pinned.
    if (legal.has(attacker) || after.get(attacker)?.type === 'k') continue;
    const pin = pinShapes(after).find((hit) => hit.pinned === attacker);
    const pinned = pieceAt(after, attacker);
    const by = pin ? pieceAt(after, pin.by) : null;
    if (pinned && by) return { kind: 'pinnedCannotTake', pinned, by };
  }
  return null;
}

/** A pin the move makes, to the king or to a piece worth more (`pins`:
 * not an exchange offered). */
function newPin({ before, after, move }: IdeaContext): MoveIdea | null {
  const had = new Set(pinsOf(before.fen()).map((hit) => `${hit.by}${hit.pinned}`));
  const hit = pinsOf(after.fen()).find((each) => after.get(each.by)?.color === move.color && !had.has(`${each.by}${each.pinned}`) && !['p', 'k'].includes(after.get(each.pinned)?.type ?? 'p'));
  const pinned = hit ? pieceAt(after, hit.pinned) : null;
  const to = hit ? pieceAt(after, hit.against) : null;
  return pinned && to ? { kind: 'pins', pinned, to } : null;
}

/** The pinning piece, attacked, steps back along the line and keeps the pin (…Bh5 after h3). */
function keepsPin({ before, after, move }: IdeaContext): MoveIdea | null {
  const was = pinsOf(before.fen()).find((hit) => hit.by === move.from && !['p', 'k'].includes(before.get(hit.pinned)?.type ?? 'p'));
  if (!was) return null;
  const still = pinsOf(after.fen()).find((hit) => hit.by === move.to && hit.pinned === was.pinned);
  const pinned = still ? pieceAt(after, still.pinned) : null;
  return pinned ? { kind: 'keepsPin', pinned } : null;
}

/** An own piece pinned after the move that was not before: the queen that
 * takes back on e7 leaves the knight on f6 pinned to it. */
function leavesPinned({ before, after, mover }: IdeaContext): MoveIdea | null {
  const had = new Set(pinsOf(before.fen()).map((hit) => hit.pinned));
  const hit = pinsOf(after.fen()).find((each) => after.get(each.pinned)?.color === mover && !['p', 'k'].includes(after.get(each.pinned)?.type ?? 'p') && !had.has(each.pinned));
  const pinned = hit ? pieceAt(after, hit.pinned) : null;
  const to = hit ? pieceAt(after, hit.against) : null;
  return pinned && to ? { kind: 'leavesPinned', pinned, to } : null;
}

function kicks({ fenBefore, move, after }: IdeaContext): MoveIdea | null {
  const kick = kickTarget(fenBefore, move.san);
  // A kick that hangs the pawn for nothing is no tempo: `kickTarget` checks `see` too.
  return kick && see(after.fen(), move.to, move.color === 'w' ? 'b' : 'w') <= 0 ? { kind: 'kicks', target: kick.target, pinning: kick.pinning } : null;
}

/** An enemy piece the move leaves with one move or none, that had three or
 * more: the bishop dominated, the queen with one flight square. */
function restricts({ fast, enemy }: IdeaContext): MoveIdea | null {
  const { after, enemyBefore } = fast;
  // In check every piece but the king is short of moves: that is the check, not a bind.
  if (!enemyBefore || after.inCheck() || !hasLegalMove(after)) return null;
  for (let index = 0; index < 64; index++) {
    const piece = after.squares[index] ?? 0;
    if (!piece || colorOf(piece) !== enemy || symbolOf(piece) === 'p' || symbolOf(piece) === 'k') continue;
    const now = legalMoves(after, index).length;
    if (now > 1) continue;
    if (legalMoves(enemyBefore, index).length >= 3) return { kind: 'restricts', piece: { piece: symbolOf(piece), square: squareOf(index) }, moves: now };
  }
  return null;
}
