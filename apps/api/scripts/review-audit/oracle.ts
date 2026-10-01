import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

/** The checker's own small board toolkit, on chess.js only. It deliberately
 * does not import the analysis package's `see`, `loosePieces` or `forks`:
 * a check built on the code it checks agrees with it by construction. */

export const POINTS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_BY_NAME: Record<string, PieceSymbol> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export function colorOf(side: 'white' | 'black'): Color {
  return side === 'white' ? 'w' : 'b';
}

export function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function pieceAt(fen: string, square: string): { type: PieceSymbol; color: Color } | null {
  return new Chess(fen).get(square as Square) ?? null;
}

/** The fen after `san`, or null when it is not legal there. */
export function play(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move(san);
    return chess.fen();
  } catch {
    return null;
  }
}

/** Every fen along a line; stops at the first illegal move. `legal` says whether it got to the end. */
export function playLine(fen: string, sans: readonly string[]): { fens: string[]; legal: boolean } {
  const fens = [fen];
  for (const san of sans) {
    const next = play(fens[fens.length - 1] ?? fen, san);
    if (!next) return { fens, legal: false };
    fens.push(next);
  }
  return { fens, legal: true };
}

/** White's material minus Black's, in pawns. */
export function balance(fen: string): number {
  let sum = 0;
  for (const row of new Chess(fen).board()) for (const cell of row) if (cell) sum += (cell.color === 'w' ? 1 : -1) * POINTS[cell.type];
  return sum;
}

/** The side's material gain over a line (positive: it won material). */
export function lineGain(fen: string, sans: readonly string[], side: Color): number {
  const { fens } = playLine(fen, sans);
  const change = balance(fens[fens.length - 1] ?? fen) - balance(fen);
  return side === 'w' ? change : -change;
}

/** The side's gain where the line first goes quiet (the next move takes
 * nothing and its mover is not in check), or at the line's end, whichever is
 * more. The end alone misreads a true "wins the knight": the Opera game's
 * 8.Qxb7 wins a pawn and the engine's line gives one back twelve plies on;
 * the owner game's 18…Rxd3 wins a knight and the line ends with a8=Q, which
 * comes with or without it. */
export function settledGain(fen: string, sans: readonly string[], side: Color): number {
  const chess = new Chess(fen);
  let quiet = fen;
  for (const [index, san] of sans.entries()) {
    const inCheck = chess.inCheck();
    let captured: boolean;
    try {
      captured = Boolean(chess.move(san).captured);
    } catch {
      break;
    }
    if (index > 0 && !inCheck && !captured) break;
    quiet = chess.fen();
  }
  const change = balance(quiet) - balance(fen);
  return Math.max(side === 'w' ? change : -change, lineGain(fen, sans, side));
}

/** Whether a move a sentence recommends (or names as the punishment) is one
 * the engine would play: within two pawns of its best line, or still better
 * than a pawn up for its side. `lines` are the engine's, best first, scores
 * from White's side. 39.Kc3 "let them win a rook with dxc6": Black's best
 * was …Rc2+ (-5.9) and dxc6 lets the d-pawn queen (+1.6). */
export function moveIsSound(lines: readonly { san: string; cp: number | null; mate: number | null }[], san: string, side: Color): boolean {
  const score = (line: { cp: number | null; mate: number | null }): number => {
    const white = line.mate !== null ? Math.sign(line.mate) * (100_000 - Math.abs(line.mate)) : (line.cp ?? 0);
    return side === 'w' ? white : -white;
  };
  const named = lines.find((line) => line.san === san);
  const best = lines[0];
  if (!named || !best) return true;
  return score(named) >= score(best) - 200 || score(named) >= 100;
}

/** Whether a line that nets `won` delivers a card's prize worth `claimed`:
 * more than half of it. "Wins the queen" is fair when a knight is given for
 * it (the Petrov's Nc6+, net 6); "wins a rook" is not when a knight is
 * given for it (net 2: that is the exchange). */
export function prizeWon(claimed: number, won: number): boolean {
  return won >= 1 && won * 2 > claimed;
}

/** Who has a decided game on the engine's best line (a forced mate, or five
 * pawns up), or `null`. The owner's calibration rule: in a decided game
 * small positional notes are clutter. */
export function decidedFor(lines: readonly { cp: number | null; mate: number | null }[]): Color | null {
  const best = lines[0];
  if (!best) return null;
  if (best.mate !== null) return best.mate > 0 ? 'w' : 'b';
  if (Math.abs(best.cp ?? 0) < 500) return null;
  return (best.cp ?? 0) > 0 ? 'w' : 'b';
}

/** A sentence that says a mate is forced without saying in how many moves
 * ("They forced mate."), unless the move it is about is the mate itself.
 * The owner's calibration rule: say "mate in 5". */
export function mateWithoutCount(text: string, san: string): boolean {
  if (!/\bforc(e|ed|ing) mate\b/.test(text) || /\bmate in \d+\b/.test(text)) return false;
  const named = /\bwith (\S+?)[.,]?(?: |$)/.exec(text)?.[1];
  return !(named ?? san).endsWith('#');
}

/** Whether a mate card's count (`gain.mateIn`, which counts the card's own
 * move as the first) is the engine's. A move still to be played mates in as
 * many on its own line; a move that was played leaves one fewer on the line
 * that answers it; a move that is the mate counts 1. */
export function mateCountAgrees(mateIn: number, san: string, line: { mate: number | null } | undefined, played: boolean): boolean {
  if (san.endsWith('#')) return mateIn === 1;
  if (!line || line.mate === null) return false;
  return Math.abs(line.mate) + (played ? 1 : 0) === mateIn;
}

/** The legal answers to a check, sorted the way the dossier's fact sorts
 * them: taking the checker is a capture whoever takes (the king too, and a
 * pawn en passant); a king move is one that takes no checker; the rest
 * block. One promotion (the queen) stands for all four. */
export function checkAnswerSets(fen: string): { blocks: string[]; captures: string[]; kingMoves: string[] } {
  const chess = new Chess(fen);
  const king = kingSquare(fen, chess.turn()) ?? '';
  const checkers = attackersOf(fen, king, other(chess.turn()));
  const moves = chess.moves({ verbose: true }).filter((move) => !move.promotion || move.promotion === 'q');
  const takesChecker = (move: (typeof moves)[number]): boolean => checkers.includes(move.to) || (move.isEnPassant() && checkers.includes(`${move.to[0]}${move.from[1]}` as Square));
  return {
    blocks: moves.filter((move) => move.piece !== 'k' && !takesChecker(move)).map((move) => move.san),
    captures: moves.filter(takesChecker).map((move) => move.san),
    kingMoves: moves.filter((move) => move.piece === 'k' && !takesChecker(move)).map((move) => move.san)
  };
}

/** Squares of `by`'s pieces that attack `square` (pseudo-legal, pins ignored). */
export function attackersOf(fen: string, square: string, by: Color): Square[] {
  return new Chess(fen).attackers(square as Square, by);
}

/** The same position with the other side to move (en passant cleared). */
export function withTurn(fen: string, turn: Color): string {
  const parts = fen.split(' ');
  parts[1] = turn;
  parts[3] = '-';
  return parts.join(' ');
}

/** The board after a threat: `san` played by the side not to move, had the
 * mover passed. Null when the mover is in check (no pass exists) or the
 * move is not legal there. */
export function threatFen(fen: string, san: string): string | null {
  return inCheck(fen) ? null : play(withTurn(fen, other(turnOf(fen))), san);
}

/** Legal captures of `square` by `by`, from a position where `by` is to move. */
export function legalCapturesOf(fen: string, square: string, by: Color): string[] {
  try {
    const chess = new Chess(withTurn(fen, by));
    return chess.moves({ verbose: true }).filter((move) => move.to === square && move.captured).map((move) => move.san);
  } catch {
    return [];
  }
}

export interface Mention {
  color: Color | null;
  piece: PieceSymbol;
  square: string;
  text: string;
}

const MENTION = /\b(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b/gi;

/** "the knight on f3", "the black pawn on e5": every piece a sentence places on a square. */
export function mentions(text: string): Mention[] {
  return [...text.matchAll(MENTION)].map((match) => ({
    color: match[1] ? colorOf(match[1].toLowerCase() as 'white' | 'black') : null,
    piece: PIECE_BY_NAME[(match[2] ?? '').toLowerCase()] ?? 'p',
    square: (match[3] ?? '').toLowerCase(),
    text: match[0]
  }));
}

export function mentionOn(fen: string, mention: Mention): boolean {
  const found = pieceAt(fen, mention.square);
  return Boolean(found && found.type === mention.piece && (mention.color === null || found.color === mention.color));
}

export function isCheckmate(fen: string): boolean {
  return new Chess(fen).isCheckmate();
}

export function inCheck(fen: string): boolean {
  return new Chess(fen).inCheck();
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function kingSquare(fen: string, color: Color): string | null {
  const chess = new Chess(fen);
  for (const row of chess.board()) for (const cell of row) if (cell?.type === 'k' && cell.color === color) return cell.square;
  return null;
}

/** What `by` wins by capturing on `square` and then trading off there
 * (each side may stop when going on loses), over real legal moves: pins,
 * checks and x-rays behind a capturer all count. Its own exchange search,
 * independent of the analysis package's `see`. Positive: the piece can be won. */
export function exchangeGain(fen: string, square: string, by: Color): number {
  const start = turnOf(fen) === by ? fen : withTurn(fen, by);
  const captures = capturesOn(start, square);
  if (!captures.length) return 0;
  return Math.max(...captures.map(({ value, fen: after }) => value - Math.max(0, replyGain(after, square, 1))));
}

function replyGain(fen: string, square: string, depth: number): number {
  if (depth > 12) return 0;
  const captures = capturesOn(fen, square);
  if (!captures.length) return 0;
  return Math.max(...captures.map(({ value, fen: after }) => value - Math.max(0, replyGain(after, square, depth + 1))));
}

function capturesOn(fen: string, square: string): { value: number; fen: string }[] {
  const chess = new Chess(fen);
  return chess
    .moves({ verbose: true })
    .filter((move) => move.to === square && move.captured)
    .map((move) => {
      const next = new Chess(fen);
      next.move(move.san);
      return { value: POINTS[move.captured ?? 'p'] + (move.promotion ? POINTS[move.promotion] - 1 : 0), fen: next.fen() };
    });
}

/** A pawn of `side` on the file with no enemy pawn ahead of it on its own or a neighbouring file. */
export function hasPassedPawnOn(fen: string, file: string, side: Color): boolean {
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8];
  const files = 'abcdefgh';
  const at = files.indexOf(file);
  return ranks.some((rank) => {
    const piece = pieceAt(fen, `${file}${rank}`);
    if (piece?.type !== 'p' || piece.color !== side) return false;
    const ahead = ranks.filter((each) => (side === 'w' ? each > rank : each < rank));
    return [at - 1, at, at + 1]
      .filter((index) => index >= 0 && index < 8)
      .every((index) => ahead.every((each) => {
        const blocker = pieceAt(fen, `${files[index] ?? ''}${each}`);
        return !(blocker?.type === 'p' && blocker.color !== side);
      }));
  });
}
