import { Chess, type Square } from 'chess.js';
import { inspectMoves } from '../inspect-moves.js';
import { PIECE_NAMES } from '../piece-names.js';
import { boardFacts } from './move-facts.js';
import { canBeTaken } from './safety.js';

/** Why the engine's move was better, in board facts: what it does, and each
 * piece the played move left hanging that it keeps safe ("Nc3 keeps the rook
 * on a1 safe"). The model is never left to guess the reason. */
export function betterMoveFacts(fenBefore: string, playedSan: string, betterSan: string): string[] {
  const played = inspectMoves(fenBefore, [playedSan]).moves[0];
  const better = inspectMoves(fenBefore, [betterSan]).moves[0];
  if (!played?.legal || !better?.legal) return [];
  const stillHanging = new Set(better.leavesHanging.filter((piece) => canBeTaken(better.resultFen, piece.square)).map((piece) => piece.square));
  // Only a piece already standing there, which the better move leaves in
  // place: 6.hxg4's own pawn on g4 read "c3 keeps the pawn on g4 safe".
  const standing = new Chess(better.resultFen);
  const kept = played.leavesHanging
    .filter((piece) => piece.square !== played.to && standing.get(piece.square as Square)?.type === piece.piece)
    .filter((piece) => canBeTaken(played.resultFen, piece.square) && !stillHanging.has(piece.square))
    .map((piece) => `keeps the ${PIECE_NAMES[piece.piece]} on ${piece.square} safe${newDefenders(played.resultFen, better.resultFen, piece.square as Square)}`);
  // The better move takes the loose piece itself away: "Ba4 keeps the
  // bishop on b5 safe" named a square the bishop had left.
  const escapes = played.leavesHanging
    .filter((piece) => piece.square === better.from && canBeTaken(played.resultFen, piece.square))
    .map((piece) => `takes the ${PIECE_NAMES[piece.piece]} out of danger on ${piece.square}`);
  return [...boardFacts(fenBefore, betterSan), ...escapes, ...kept];
}

/** ": the queen on d1 now defends it" — how the better move keeps it safe,
 * so the model doesn't guess ("Nc3 blocks the queen's attack", it doesn't). */
function newDefenders(playedFen: string, betterFen: string, square: Square): string {
  const played = new Chess(playedFen);
  const better = new Chess(betterFen);
  const owner = better.get(square)?.color;
  if (!owner) return '';
  const before = new Set(played.attackers(square, owner));
  const added = better.attackers(square, owner).filter((from) => !before.has(from));
  const names = added.map((from) => `the ${PIECE_NAMES[better.get(from)!.type]} on ${from}`);
  return names.length ? `: ${names.join(' and ')} now ${names.length > 1 ? 'defend' : 'defends'} it` : '';
}

/** The moved piece used to guard the square the opponent's best reply lands
 * on ("the queen stops guarding c1, where Qc1# follows"): why a move loses,
 * stated rather than guessed. */
export function abandonedGuard(fenBefore: string, san: string, replySan: string | undefined): string[] {
  const moved = inspectMoves(fenBefore, [san]).moves[0];
  if (!moved?.legal || !replySan) return [];
  const reply = inspectMoves(moved.resultFen, [replySan]).moves[0];
  if (!reply?.legal || !(reply.captured || reply.gives)) return [];
  const target = reply.to as Square;
  // Moving onto the square is not leaving it: "the bishop stops guarding c3"
  // after …Bxc3 put the bishop on c3 was nonsense.
  if (target === moved.to) return [];
  const color = moved.color === 'white' ? 'w' : 'b';
  const guardedBefore = new Chess(fenBefore).attackers(target, color).includes(moved.from as Square);
  const guardsAfter = new Chess(moved.resultFen).attackers(target, color).includes(moved.to as Square);
  return guardedBefore && !guardsAfter ? [`the ${PIECE_NAMES[moved.piece]} stops guarding ${target}, where ${replySan} follows`] : [];
}
