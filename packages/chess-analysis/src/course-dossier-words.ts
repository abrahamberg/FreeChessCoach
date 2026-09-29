import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { cpToWords, mateToWords } from './eval-words.js';
import { inspectMoves } from './inspect-moves.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { PIECE_NAMES } from './piece-names.js';

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
  if (inspected.captured) facts.push(`captures the ${PIECE_NAMES[inspected.captured]} on ${inspected.to}`);
  if (inspected.gives) facts.push(`gives ${inspected.gives}`);
  if (inspected.gives === 'checkmate' && isBackRankMate(inspected.resultFen, inspected.to as Square)) facts.push('a back-rank mate');
  if (inspected.gives === 'checkmate') facts.push(mateNet(inspected.resultFen));
  if (inspected.gives === 'check') facts.push(checkAnswers(inspected.resultFen));
  // A mate ends the game: what else the piece hits is noise ("Nd6# forks the
  // bishop on c8").
  if (inspected.gives !== 'checkmate') facts.push(...attackedPieces(inspected.resultFen, inspected.to as Square));
  for (const piece of inspected.leavesHanging) {
    if (canBeTaken(inspected.resultFen, piece.square)) facts.push(`leaves the ${PIECE_NAMES[piece.piece]} on ${piece.square} hanging`);
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
  const moves = chess.moves({ verbose: true });
  const kingMoves = moves.filter((move) => move.piece === 'k').map((move) => move.san);
  const captures = moves.filter((move) => move.piece !== 'k' && checker.includes(move.to)).map((move) => move.san);
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
  const kept = played.leavesHanging
    .filter((piece) => canBeTaken(played.resultFen, piece.square) && !stillHanging.has(piece.square))
    .map((piece) => `keeps the ${PIECE_NAMES[piece.piece]} on ${piece.square} safe${newDefenders(played.resultFen, better.resultFen, piece.square as Square)}`);
  return [...boardFacts(fenBefore, betterSan), ...kept];
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

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** A capture on the square that wins material: legal (a pinned attacker
 * doesn't count), and not answered by a recapture that costs the taker more
 * than it took. The first real runs read "leaves the rook on a1 hanging"
 * after 6.Bc3 in the Englund, where …Qxa1 loses the queen to Bxa1: the
 * bishop sees a1 once the queen leaves b2. */
function canBeTaken(fenAfter: string, square: string): boolean {
  const chess = new Chess(fenAfter);
  return chess.moves({ verbose: true }).some((move) => {
    if (move.to !== square || !move.captured) return false;
    const after = new Chess(move.after);
    const recaptured = after.moves({ verbose: true }).some((reply) => reply.to === square && Boolean(reply.captured));
    return !recaptured || VALUES[move.captured] >= VALUES[move.piece];
  });
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
      const trapped = isTrapped(fenAfter, cell.square, from) ? ', which is trapped: every square it can reach loses it' : '';
      targets.push(`attacks ${target}${pin ? `, which is pinned to ${pin}` : ''}${trapped}`);
    }
  }
  return targets;
}

/** "the king by the bishop on b5" or "the queen on d8 by the bishop on g5":
 * lifting the piece off the board opens a line from an enemy piece to its
 * king, or to its queen when the piece is worth less. The Elephant's bait
 * never said the knight on f6 was pinned, which is why Nxd5 looks safe. */
function pinOf(fenAfter: string, square: Square): string | null {
  const chess = new Chess(fenAfter);
  const piece = chess.get(square);
  if (!piece) return null;
  const enemy = piece.color === 'w' ? 'b' : 'w';
  const king = chess.findPiece({ type: 'k', color: piece.color })[0];
  const queen = piece.type === 'q' ? undefined : chess.findPiece({ type: 'q', color: piece.color })[0];
  const before = (target: Square | undefined): Set<Square> => new Set(target ? chess.attackers(target, enemy) : []);
  const [kingBefore, queenBefore] = [before(king), before(queen)];
  const lifted = new Chess(fenAfter);
  lifted.remove(square);
  const pinner = (target: Square | undefined, already: Set<Square>): Square | undefined =>
    target ? lifted.attackers(target, enemy).find((from) => !already.has(from)) : undefined;
  const byKing = pinner(king, kingBefore);
  if (byKing) return `the king by the ${PIECE_NAMES[chess.get(byKing)!.type]} on ${byKing}`;
  const byQueen = pinner(queen, queenBefore);
  if (queen && byQueen && VALUES[chess.get(byQueen)!.type] < VALUES.q) return `the queen on ${queen} by the ${PIECE_NAMES[chess.get(byQueen)!.type]} on ${byQueen}`;
  return null;
}

/** The piece's side is to move, staying loses it, and so does every move it
 * has: it lands where it is lost without having taken as much. Noah's Ark
 * ended on "attacks the bishop on b3" and nothing said the bishop had
 * nowhere to go. An even trade is no loss: the Englund's pinned queen can
 * still trade itself off on c3. */
function isTrapped(fenAfter: string, square: Square, by: Square): boolean {
  const chess = new Chess(fenAfter);
  const piece = chess.get(square);
  const attacker = chess.get(by);
  const passed = flipActiveColorFen(fenAfter);
  if (!piece || !attacker || !passed || piece.color !== chess.turn() || piece.type === 'k' || piece.type === 'p' || !isLostOn(passed, square)) return false;
  // A cheaper attacker, so a defender does not help; and somewhere to go, or
  // it is only stuck (a pinned rook, a rook in its corner before castling).
  const moves = chess.moves({ square, verbose: true });
  if (VALUES[attacker.type] >= VALUES[piece.type] || !moves.length) return false;
  return moves.every((move) => (!move.captured || VALUES[move.captured] < VALUES[piece.type]) && isLostOn(move.after, move.to));
}

/** The side to move takes on the square and comes out ahead: no recapture,
 * or the piece taken is worth more than the taker. */
function isLostOn(fen: string, square: string): boolean {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).some((move) => {
    if (move.to !== square || !move.captured) return false;
    const recaptured = new Chess(move.after).moves({ verbose: true }).some((reply) => reply.to === square && Boolean(reply.captured));
    return !recaptured || VALUES[move.captured] > VALUES[move.piece];
  });
}
