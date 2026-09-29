import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { cpToWords, mateToWords } from './eval-words.js';
import { inspectMoves } from './inspect-moves.js';
import { PIECE_NAMES } from './piece-names.js';
import { see } from './see.js';
import { isProfitableCaptureOn } from './tactic-board-facts.js';
import { pins } from './tactic-pins.js';
import { trappedPieces } from './tactic-trapped.js';
import { PIECE_VALUES } from './tactics.js';

const VALUABLE = new Set(['n', 'b', 'r', 'q']);

/** One engine line in words, never a number ("White is better",
 * "Black has a forced mate in 3"). Scores are White-perspective. */
export function lineWords(line: Pick<EngineLine, 'cp' | 'mateIn'>): string {
  if (line.mateIn !== null) return mateToWords(line.mateIn, 'w');
  return cpToWords(line.cp ?? 0, 'w');
}

/** The position in words: the engine's top line, or the board state when
 * the game is over (a mated or stalemated position has no engine line). */
export function positionWords(fen: string, evaluation: EngineEval | undefined): string {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  const top = evaluation?.lines[0];
  return top ? lineWords(top) : 'no engine verdict';
}

/** What a move does on the board, from chess.js alone: captures, checks,
 * pieces it now attacks (and whether they are pinned to their king), what it
 * leaves hanging, forks by the moved piece. Only facts about this move: the
 * verifier lets a script say "pin" or "fork" only where these say it. */
export function boardFacts(fenBefore: string, san: string): string[] {
  const inspected = inspectMoves(fenBefore, [san]).moves[0];
  if (!inspected?.legal) return [];
  const facts: string[] = [moveWords(inspected.san, inspected.piece, inspected.from, inspected.to)];
  const promoted = /=([QRBN])/.exec(inspected.san)?.[1];
  if (promoted) facts.push(`promotes to a ${PIECE_NAMES[promoted.toLowerCase() as PieceSymbol]}`);
  // En passant takes the pawn beside the capturer, not on the square it
  // lands on: 1.fxg6# read "captures the pawn on g6" for the pawn on g5.
  const enPassant = inspected.captured !== null && new Chess(fenBefore).move(inspected.san).isEnPassant();
  if (enPassant) facts.push(`captures the pawn on ${inspected.to[0]}${inspected.from[1]} en passant`);
  else if (inspected.captured) facts.push(`captures the ${PIECE_NAMES[inspected.captured]} on ${inspected.to}`);
  facts.push(...blockedCheck(fenBefore, inspected.piece, inspected.to), ...endgameGeometry(inspected.resultFen, inspected.piece, inspected.to as Square));
  if (inspected.gives) facts.push(`gives ${inspected.gives}`, ...discovered(inspected.resultFen, inspected.to as Square));
  if (inspected.gives === 'checkmate' && isBackRankMate(inspected.resultFen, inspected.to as Square)) facts.push('a back-rank mate');
  if (inspected.gives === 'checkmate') facts.push(mateNet(inspected.resultFen));
  if (inspected.gives === 'check') facts.push(checkAnswers(inspected.resultFen));
  // A mate ends the game: what else the piece hits is noise ("Nd6# forks the
  // bishop on c8").
  if (inspected.gives !== 'checkmate') facts.push(...attackedPieces(inspected.resultFen, inspected.to as Square));
  // A capture taken back is a trade, not a piece left hanging: 3…cxd4 read
  // "leaves the pawn on d4 hanging" in every Open Sicilian.
  const traded = (square: string): boolean => square === inspected.to && inspected.captured !== null && valueOf(inspected.captured) >= valueOf(inspected.piece);
  const owner = new Chess(fenBefore).turn() === 'w' ? 'white' : 'black';
  for (const piece of inspected.leavesHanging) {
    // Whose piece: the model read "exd5 leaves the pawn on g4 hanging" as
    // the learner's pawn, and it was White's.
    if (!traded(piece.square) && canBeTaken(inspected.resultFen, piece.square)) facts.push(`leaves the ${owner} ${PIECE_NAMES[piece.piece]} on ${piece.square} hanging${takingStalemates(inspected.resultFen, piece.square) ? ': taking it is stalemate' : ''}`);
  }
  // A piece that is simply taken forks nothing: 3.Qg8+ in Philidor's Legacy
  // read "forks the rook on a8 and the king on h8" before …Rxg8.
  const forker = inspected.gives !== 'checkmate' && !canBeTaken(inspected.resultFen, inspected.to);
  for (const fork of inspected.createsForks) {
    const targets = forkTargets(inspected.resultFen, fork.forkedSquares);
    if (forker && fork.square === inspected.to && targets.length >= 2) facts.push(`the ${PIECE_NAMES[fork.piece]} on ${fork.square} forks ${targets.join(' and ')}`);
  }
  return facts;
}

/** A capture of the piece on `square` leaves the capturer's opponent no
 * legal move: the desperado rook of a stalemate save (…Rg2+ Kxg2). */
function takingStalemates(fen: string, square: string): boolean {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).some((move) => {
    if (move.to !== square || !move.captured) return false;
    chess.move(move);
    const stalemate = chess.isStalemate();
    chess.undo();
    return stalemate;
  });
}

/** Who gives the check when the moved piece is not the only one: the
 * Petrov's 5.Nc6+ is the queen on e2's check, which "gives check" hid. */
function discovered(fenAfter: string, to: Square): string[] {
  const chess = new Chess(fenAfter);
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  if (!king) return [];
  const checkers = chess.attackers(king, chess.turn() === 'w' ? 'b' : 'w');
  const others = checkers.filter((square) => square !== to).map((square) => `the ${PIECE_NAMES[chess.get(square)!.type]} on ${square}`);
  if (!others.length) return [];
  return checkers.includes(to) ? [`a double check, with ${others.join(' and ')}`] : [`a discovered check from ${others.join(' and ')}`];
}

/** The Lucena's 7.Rb4 builds the bridge by blocking a check: the one fact
 * the course is about, and the board facts never said it. */
function blockedCheck(fenBefore: string, piece: PieceSymbol, to: string): string[] {
  const chess = new Chess(fenBefore);
  if (!chess.inCheck() || piece === 'k') return [];
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  const checkers = king ? chess.attackers(king, chess.turn() === 'w' ? 'b' : 'w') : [];
  const checker = checkers.length === 1 ? checkers[0] : undefined;
  if (!checker || checker === to) return [];
  return [`blocks the check from the ${PIECE_NAMES[chess.get(checker)!.type]} on ${checker}`];
}

/** King-and-pawn geometry, stated where it decides the game and only with
 * kings and pawns on the board: the opposition after a king move, and a
 * passed pawn the enemy king cannot catch (the rule of the square). */
function endgameGeometry(fenAfter: string, piece: PieceSymbol, to: Square): string[] {
  const chess = new Chess(fenAfter);
  const cells = chess.board().flat().filter((cell) => cell !== null);
  // Stalemate ends it: no king has to give way (the rook's-pawn draw's 3.a7).
  if (cells.some((cell) => cell.type !== 'k' && cell.type !== 'p') || chess.isGameOver()) return [];
  const mover = chess.turn() === 'w' ? 'b' : 'w';
  const own = chess.findPiece({ type: 'k', color: mover })[0];
  const enemy = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  if (!own || !enemy) return [];
  const file = (square: string): number => square.charCodeAt(0) - 97;
  const rank = (square: string): number => Number(square[1]);
  const facts: string[] = [];
  if (piece === 'k') {
    const [ownFile, ownRank] = [file(own), rank(own)];
    const [enemyFile, enemyRank] = [file(enemy), rank(enemy)];
    const facing = (ownFile === enemyFile && Math.abs(ownRank - enemyRank) === 2) || (ownRank === enemyRank && Math.abs(ownFile - enemyFile) === 2);
    if (facing) facts.push('takes the opposition: the kings face each other with one square between, and the other king must give way');
  }
  if (piece === 'p') {
    const up = mover === 'w' ? 1 : -1;
    const promotion = `${to[0]}${mover === 'w' ? 8 : 1}`;
    const ahead = cells.some((cell) => cell.type === 'p' && cell.color !== mover && Math.abs(file(cell.square) - file(to)) <= 1 && (rank(cell.square) - rank(to)) * up > 0);
    const steps = mover === 'w' ? 8 - rank(to) : rank(to) - 1;
    const distance = Math.max(Math.abs(file(enemy) - file(promotion)), Math.abs(rank(enemy) - rank(promotion)));
    if (!ahead && distance > steps) facts.push(`the ${mover === 'w' ? 'black' : 'white'} king on ${enemy} is outside the pawn's square: it cannot catch the pawn`);
  }
  return facts;
}

/** What moved where, so a quiet move has a true fact too (gemma-4-12b
 * wrote "4.Bf4 attacks the queen" where the dossier said nothing). */
function moveWords(san: string, piece: PieceSymbol, from: string, to: string): string {
  if (san.startsWith('O-O-O')) return 'castles queenside';
  if (san.startsWith('O-O')) return 'castles kingside';
  return `moves the ${PIECE_NAMES[piece]} from ${from} to ${to}`;
}

/** Mate by a piece on the king's own back rank, checking along it. */
function isBackRankMate(fenAfter: string, checker: Square): boolean {
  const chess = new Chess(fenAfter);
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  const backRank = chess.turn() === 'w' ? '1' : '8';
  return king !== undefined && king[1] === backRank && checker[1] === backRank;
}

/** Why it is mate, square by square: which of the king's squares hold its
 * own pieces, which are covered and by what, and which adjacent attackers
 * are guarded. gemma-4-12b invented "Nd5# saves your knight on e5" when the
 * dossier only said "gives checkmate". */
function mateNet(fenAfter: string): string {
  const chess = new Chess(fenAfter);
  const side = chess.turn();
  const enemy = side === 'w' ? 'b' : 'w';
  const king = chess.findPiece({ type: 'k', color: side })[0];
  if (!king) return 'checkmate';
  const name = (square: Square): string => `the ${PIECE_NAMES[chess.get(square)!.type]} on ${square}`;
  // The king's own square blocks the lines through it: with it on the board,
  // Qc1# read "h1 is covered by " (the queen sees h1 once the king steps there).
  const lifted = new Chess(fenAfter);
  lifted.remove(king);
  const own: string[] = [];
  const covered = new Map<string, string[]>();
  const guarded: string[] = [];
  for (const square of kingNeighbours(king)) {
    const piece = chess.get(square);
    const by = lifted.attackers(square, enemy).map(name);
    if (piece?.color === side) own.push(square);
    else if (piece) guarded.push(`${name(square)} is guarded by ${by.join(' and ')}`);
    else {
      const key = by.join(' and ');
      covered.set(key, [...(covered.get(key) ?? []), square]);
    }
  }
  const parts = [`the king on ${king} is checked by ${chess.attackers(king, enemy).map(name).join(' and ')}`];
  if (own.length) parts.push(`${own.join(', ')} ${own.length > 1 ? 'hold' : 'holds'} its own pieces`);
  for (const [by, squares] of covered) parts.push(`${squares.join(' and ')} ${squares.length > 1 ? 'are' : 'is'} covered by ${by}`);
  parts.push(...guarded);
  return `why it is mate: ${parts.join('; ')}`;
}

function kingNeighbours(king: Square): Square[] {
  const file = king.charCodeAt(0);
  const rank = Number(king[1]);
  const squares: Square[] = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      const f = file + df;
      const r = rank + dr;
      if ((df || dr) && f >= 97 && f <= 104 && r >= 1 && r <= 8) squares.push(`${String.fromCharCode(f)}${r}` as Square);
    }
  }
  return squares;
}

/** How the checked side can answer, so a script can't say "forces the king
 * to move" when a block exists (gemma-4-12b did, on 4...Qb4+). */
function checkAnswers(fenAfter: string): string {
  const chess = new Chess(fenAfter);
  const checker = chess.attackers(chess.findPiece({ type: 'k', color: chess.turn() })[0] as Square, chess.turn() === 'w' ? 'b' : 'w');
  // One promotion stands for all four: "dxe1=N, dxe1=B, dxe1=R, dxe1=Q".
  const moves = chess.moves({ verbose: true }).filter((move) => !move.promotion || move.promotion === 'q');
  // The king taking the checker takes it: 8.Qxd8+ read "the checking piece
  // cannot be taken; move the king with Kxd8".
  const kingMoves = moves.filter((move) => move.piece === 'k' && !checker.includes(move.to)).map((move) => move.san);
  const captures = moves.filter((move) => checker.includes(move.to)).map((move) => move.san);
  const blocks = moves.filter((move) => move.piece !== 'k' && !checker.includes(move.to)).map((move) => move.san);
  const ways = [
    blocks.length ? `block with ${blocks.join(', ')}` : 'no block',
    captures.length ? `take the checking piece with ${captures.join(', ')}` : 'the checking piece cannot be taken',
    kingMoves.length ? `move the king with ${kingMoves.join(', ')}` : 'the king cannot move'
  ];
  return `the check can be answered: ${ways.join('; ')}`;
}

/** The forked pieces by name, pawns left out: "forks e5 and a2 and c2" read
 * as nonsense and was copied word for word. */
function forkTargets(fenAfter: string, squares: string[]): string[] {
  const chess = new Chess(fenAfter);
  return squares.flatMap((square) => {
    const piece = chess.get(square as Square);
    return piece && piece.type !== 'p' ? [`the ${PIECE_NAMES[piece.type]} on ${square}`] : [];
  });
}

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

/** tactics.ts's values, the king above everything: it never trades, and
 * never traps a piece. */
const valueOf = (piece: PieceSymbol): number => (piece === 'k' ? 100 : PIECE_VALUES[piece]);

/** A legal capture on the square that does not lose material over the
 * whole exchange (the shared SEE): a free piece, or one only traded off, as
 * a forker that can be traded has forked nothing. The first real runs read
 * "leaves the rook on a1 hanging" after 6.Bc3 in the Englund, where …Qxa1
 * loses the queen to Bxa1. */
function canBeTaken(fenAfter: string, square: string): boolean {
  const chess = new Chess(fenAfter);
  const target = square as Square;
  const legal = chess.attackers(target, chess.turn()).some((from) => chess.moves({ square: from, verbose: true }).some((move) => move.to === target));
  return legal && see(fenAfter, target, chess.turn()) >= 0;
}

/** Enemy knights, bishops, rooks and queens the moved piece now hits. */
function attackedPieces(fenAfter: string, from: Square): string[] {
  const chess = new Chess(fenAfter);
  const mover = chess.get(from);
  if (!mover) return [];
  const targets: string[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color === mover.color || !VALUABLE.has(cell.type)) continue;
      if (!chess.attackers(cell.square, mover.color).includes(from)) continue;
      const target = `the ${PIECE_NAMES[cell.type]} on ${cell.square}`;
      const pin = pinOf(fenAfter, cell.square);
      const boxed = !chess.moves({ square: cell.square }).length && chess.turn() === cell.color;
      const trapped = isTrapped(fenAfter, cell.square, from) ? (boxed ? ', which is trapped: it cannot move, and no move saves it' : ', which is trapped: every square it can reach loses it') : '';
      targets.push(`attacks ${target}${pin ? `, which is pinned to ${pin}` : ''}${trapped}`);
    }
  }
  return targets;
}

/** "the king by the bishop on b5" or "the queen on d8 by the bishop on g5",
 * from the shared `pins()`: pinned to the king, or to the queen by a
 * cheaper piece. The Elephant's bait never said the knight on f6 was
 * pinned, which is why Nxd5 looks safe. */
function pinOf(fenAfter: string, square: Square): string | null {
  const chess = new Chess(fenAfter);
  const hits = pins(chess).filter((hit) => hit.pinned === square);
  const name = (at: Square): string => PIECE_NAMES[chess.get(at)!.type];
  const toKing = hits.find((hit) => hit.kind === 'absolute');
  if (toKing) return `the king by the ${name(toKing.by)} on ${toKing.by}`;
  const toQueen = hits.find((hit) => chess.get(hit.against)?.type === 'q' && chess.get(hit.by)?.type !== 'q');
  return toQueen ? `the queen on ${toQueen.against} by the ${name(toQueen.by)} on ${toQueen.by}` : null;
}

/** The shared `trappedPieces` (lost where it stands and wherever it goes,
 * over the whole exchange), for a piece the moved piece attacks: Noah's Ark
 * ended on "attacks the bishop on b3" and nothing said the bishop had
 * nowhere to go. Two conditions on the attacker are the course's own: it is
 * cheaper, so a defender does not help, and it cannot simply be taken (the
 * Immortal's Nb6 on the rook, answered by …axb6). */
function isTrapped(fenAfter: string, square: Square, by: Square): boolean {
  const chess = new Chess(fenAfter);
  const piece = chess.get(square);
  const attacker = chess.get(by);
  if (!piece || !attacker || valueOf(attacker.type) >= valueOf(piece.type) || isLostOn(fenAfter, by)) return false;
  return trappedPieces(chess, piece.color).some((hit) => hit.square === square);
}

/** The side to move takes on the square and comes out ahead: the shared
 * SEE's profitable capture. */
function isLostOn(fen: string, square: string): boolean {
  return isProfitableCaptureOn(fen, square as Square, new Chess(fen).turn());
}
