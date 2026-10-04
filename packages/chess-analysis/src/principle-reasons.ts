import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { isImprovableQuality, type EngineEval, type MoveQuality } from '@freechesscoach/shared';
import { flipActiveColorFen } from './null-move-fen.js';
import { allowsChecksText, blocksOwnPieceText, givesUpCentreText, connectsRooksText, coordinationFragment, freesEnemyPieceText, opensOwnPieceText, pilesOnText, supportsAdvancedPieceText } from './piece-coordination.js';
import { PIECE_NAMES } from './piece-names.js';
import { pinReason } from './pin-reason.js';
import { PIECE_VALUES } from './tactics.js';

export interface PrincipleInput {
  fenBefore: string;
  moveSan: string;
  quality?: MoveQuality;
  evalBefore: EngineEval;
  evalAfter?: EngineEval;
}

/**
 * The last layer of "why": plain opening principles, tested on the board.
 *
 * They run only after mate, material and tactics have had their say
 * (`move-reasons.ts` asks for them when nothing sharper was found), and only
 * ever from a comparison — the engine's best line follows the principle where
 * the played line breaks it. A principle alone is never a reason: the engine
 * has to agree it mattered.
 *
 * - A costly move: why the best move was better (a trade that helps the
 *   opponent develop, a piece chased twice, the queen out too early, a
 *   development that also attacks, castling put off).
 * - A move that was fine: what it did — develops with check, or attacking.
 */
export function principleReason(input: PrincipleInput): string | null {
  const best = input.evalBefore.lines[0];
  if (!best) return null;
  if (input.quality === 'book' || input.quality === 'forced') return null;
  if (!isImprovableQuality(input.quality)) return developsWithPurposeText(input.fenBefore, input.moveSan) ?? plainDevelopmentText(input) ?? openFileRookText(input) ?? outpostText(input.fenBefore, input.moveSan) ?? castleText(input.fenBefore, input.moveSan) ?? (best.moveSan === input.moveSan ? goodCoordinationText(input) : null);
  if (best.moveSan === input.moveSan) return null;

  const playedLine = [input.moveSan, ...(input.evalAfter?.lines[0]?.pvSan ?? [])];
  const bestFragment = developsWithPurpose(input.fenBefore, best.moveSan);

  return (
    tradeHelpsDevelopment(input.fenBefore, playedLine, best.moveSan, bestFragment) ??
    chasedTwice(input.fenBefore, playedLine, best.moveSan) ??
    queenOutEarly(input.fenBefore, playedLine, best.moveSan, bestFragment) ??
    (bestFragment && !developsAt(input.fenBefore, input.moveSan) ? `${best.moveSan} was better: it ${bestFragment}` : null) ??
    castlesSooner(input.fenBefore, input.moveSan, best.moveSan) ??
    blocksText(input, best.moveSan) ??
    exposesText(input, best.moveSan) ??
    pilesText(input, best.moveSan) ??
    freesText(input) ??
    bestDoesText(input, best.moveSan)
  );
}

/** A move that cost more than this lost it some other way than by cutting a piece off. */
const BLOCK_MAX_LOSS_CP = 150;

/** What the played move gave up that the engine's move kept: the king's cover
 * from checks, a pawn's hold on the centre. */
function exposesText(input: PrincipleInput, best: string): string | null {
  const [played] = line(input.fenBefore, [input.moveSan], 1);
  const [better] = line(input.fenBefore, [best], 1);
  if (!played || !better || !smallLoss(input)) return null;
  return allowsChecksText(played, better) ?? givesUpCentreText(input.fenBefore, played, better);
}

function pilesText(input: PrincipleInput, best: string): string | null {
  const [better] = line(input.fenBefore, [best], 1);
  const text = better && !better.captured && smallLoss(input) ? coordinationFragment(input.fenBefore, better) : null;
  return text ? `${best} was better: it ${text}` : null;
}

/** The last word on a move nothing else explained: what the engine's move
 * does. A pawn break that attacks a pawn, a capture, a rook onto an open file. */
function bestDoesText(input: PrincipleInput, best: string): string | null {
  const bestCp = input.evalBefore.lines[0]?.cp;
  const playedCp = input.evalAfter?.lines[0]?.cp;
  if (bestCp == null || playedCp == null || Math.abs(bestCp - playedCp) > BEST_DOES_MAX_LOSS_CP) return null;
  const [played] = line(input.fenBefore, [input.moveSan], 1);
  const [better] = line(input.fenBefore, [best], 1);
  // Both take the same piece: the capture is not what made one better.
  if (played?.captured && better?.captured && played.to === better.to) return null;
  const what = candidateDoes(input.fenBefore, best);
  return what ? `${best} was better: it ${what}` : null;
}

/** A move that cost more than this lost it some other way than by missing the engine's. */
const BEST_DOES_MAX_LOSS_CP = 300;

/** A minor piece brought out in the opening, with nothing else to say about it. */
function plainDevelopmentText(input: PrincipleInput): string | null {
  const [move] = line(input.fenBefore, [input.moveSan], 1);
  if (!move || !isDevelopment(move) || fullmoveOf(input.fenBefore) > OPENING_LAST_MOVE) return null;
  return `Develops the ${PIECE_NAMES[move.piece]}`;
}

/** A rook that goes to a file without pawns. */
function openFileRookText(input: PrincipleInput): string | null {
  const [move] = line(input.fenBefore, [input.moveSan], 1);
  if (!move || move.piece !== 'r' || move.captured || move.from[0] === move.to[0] || fileHasPawn(move)) return null;
  return `Puts the rook on the ${move.to[0]}-file, which has no pawns`;
}

function freesText(input: PrincipleInput): string | null {
  const [played] = line(input.fenBefore, [input.moveSan], 1);
  if (!played || !smallLoss(input)) return null;
  return freesEnemyPieceText(input.fenBefore, played, (input.evalAfter?.lines ?? []).flatMap((each) => each.pvSan?.[0] ?? []), threatNote);
}

function goodCoordinationText(input: PrincipleInput): string | null {
  const [move] = line(input.fenBefore, [input.moveSan], 1);
  if (!move) return null;
  const text = opensOwnPieceText(input.fenBefore, move) ?? connectsRooksText(input.fenBefore, move) ?? supportsAdvancedPieceText(input.fenBefore, move);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : null;
}

/** A positional reason fits a small loss; a big one has a sharper cause. */
function smallLoss(input: PrincipleInput): boolean {
  const bestCp = input.evalBefore.lines[0]?.cp;
  const playedCp = input.evalAfter?.lines[0]?.cp;
  return bestCp != null && playedCp != null && Math.abs(bestCp - playedCp) <= BLOCK_MAX_LOSS_CP;
}

function blocksText(input: PrincipleInput, best: string): string | null {
  const [played] = line(input.fenBefore, [input.moveSan], 1);
  const [better] = line(input.fenBefore, [best], 1);
  if (!smallLoss(input)) return null;
  return played && better && !better.captured ? blocksOwnPieceText(input.fenBefore, played, better) : null;
}

const HOME_RANK: Record<Color, string> = { w: '1', b: '8' };

/** "Early" and "castle now" are opening advice: past this move number they
 * would read as wrong. */
const OPENING_LAST_MOVE = 12;

const fullmoveOf = (fen: string): number => Number(fen.split(' ')[5] ?? '1');

function line(fen: string, sans: readonly string[], plies: number): Move[] {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const san of sans.slice(0, plies)) {
    try {
      moves.push(chess.move(san));
    } catch {
      break;
    }
  }
  return moves;
}

function isMinor(piece: PieceSymbol): boolean {
  return piece === 'n' || piece === 'b';
}

/** A knight or bishop leaving its first rank for the first time. */
function isDevelopment(move: Move): boolean {
  return isMinor(move.piece) && move.from[1] === HOME_RANK[move.color] && move.to[1] !== HOME_RANK[move.color];
}

function minorsAtHome(fen: string, color: Color): number {
  return new Chess(fen)
    .board()
    .flat()
    .filter((piece) => piece && piece.color === color && isMinor(piece.type) && piece.square[1] === HOME_RANK[color]).length;
}

function developsAt(fen: string, san: string): boolean {
  const [move] = line(fen, [san], 1);
  return move !== undefined && isDevelopment(move);
}

/** What a development did besides bring the piece out: "develops the bishop
 * with check", "develops the knight and attacks the bishop on d5". Null for a
 * development that did neither — the engine's pick of it over another needs a
 * different reason. */
function developsWithPurpose(fen: string, san: string): string | null {
  const [move] = line(fen, [san], 1);
  if (!move || !isDevelopment(move)) return null;
  const check = move.san.endsWith('+');
  const pin = check ? null : pinNote(fen, move);
  const target = check || pin ? null : newlyAttacked(fen, move);
  if (!check && !pin && !target) return null;
  const base = `develops the ${PIECE_NAMES[move.piece]}`;
  if (pin) return `${base} and ${pin}`;
  return check ? `${base} with check` : `${base} and attacks the ${PIECE_NAMES[target!.type]} on ${target!.square}`;
}

function developsWithPurposeText(fen: string, san: string): string | null {
  const text = developsWithPurpose(fen, san);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : null;
}

/** A knight on its own 4th–6th rank, on the c–f files, that no enemy pawn
 * attacks or can still advance to attack: "puts the knight on an outpost on
 * d4 that no pawn can attack". */
function outpostText(fen: string, san: string): string | null {
  const [move] = line(fen, [san], 1);
  if (!move || move.piece !== 'n') return null;
  const file = move.to.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(move.to[1]);
  const own = move.color === 'w' ? rank : 9 - rank;
  if (file < 2 || file > 5 || own < 4 || own > 6) return null;
  const enemy: Color = move.color === 'w' ? 'b' : 'w';
  const board = new Chess(move.after);
  const pawnCanReach = [file - 1, file + 1].some((neighbour) =>
    Array.from({ length: 8 }, (_, index) => index + 1).some((pawnRank) => {
      const piece = board.get(`${String.fromCharCode('a'.charCodeAt(0) + neighbour)}${pawnRank}` as Square);
      // A white pawn attacks upward, so it can still get there from below the knight; black from above.
      return piece?.type === 'p' && piece.color === enemy && (enemy === 'w' ? pawnRank < rank : pawnRank > rank);
    })
  );
  if (pawnCanReach) return null;
  const target = newlyAttacked(fen, move);
  const base = `Puts the knight on an outpost on ${move.to}, where no pawn can attack it`;
  return target ? `${base}, and attacks the ${PIECE_NAMES[target.type]} on ${target.square}` : base;
}

/** What a queenside castle did, from the board. Kingside has nothing
 * game-specific to say (it is the same sentence every time), and neither does
 * a queenside castle none of these facts hold for: both stay silent. It names what the board shows —
 * the other king already castled kingside (opposite sides: pawns can storm
 * it), the rook landing on a d-file with no pawn of its own (open or half
 * open), a kingside pawn shield already advanced (so O-O would not be safe). */
function castleText(fen: string, san: string): string | null {
  const [move] = line(fen, [san], 1);
  if (!move) return null;
  if (!move.flags.includes('q')) return null;
  const board = new Chess(fen);
  const enemy: Color = move.color === 'w' ? 'b' : 'w';
  const pawnsOn = (file: string, color?: Color): number =>
    board.board().flat().filter((piece) => piece && piece.type === 'p' && piece.square[0] === file && (color === undefined || piece.color === color)).length;
  const facts: string[] = [];
  const enemyKing = board.board().flat().find((piece) => piece && piece.type === 'k' && piece.color === enemy);
  if (enemyKing && ['g', 'h'].includes(enemyKing.square[0]!) && enemyKing.square[1] === HOME_RANK[enemy]) facts.push('the other king is on the kingside, so your kingside pawns can storm it');
  if (pawnsOn('d', move.color) === 0) facts.push(pawnsOn('d') === 0 ? 'the rook lands on the open d-file' : 'the rook lands on the half-open d-file');
  const shield = ['f', 'g', 'h'].filter((file) => board.get(`${file}${move.color === 'w' ? 2 : 7}` as Square)?.type === 'p').length;
  if (shield < 3) facts.push('the kingside pawns have already moved, so castling short was not safe');
  return facts.length ? `Castles queenside: ${facts.join('; ')}` : null;
}

/** The king moves (not castling) and with it the right to castle, which the
 * engine's move keeps: "Kxe7 gives up castling for good". True whatever else
 * is on the board: the king stays in the middle and the rook in its corner. */
export function givesUpCastlingText(input: PrincipleInput): string | null {
  if (input.quality === 'book' || input.quality === 'forced') return null;
  const [move] = line(input.fenBefore, [input.moveSan], 1);
  if (move?.piece !== 'k' || move.flags.includes('k') || move.flags.includes('q')) return null;
  const rights = input.fenBefore.split(' ')[2] ?? '-';
  if (!(move.color === 'w' ? /[KQ]/ : /[kq]/).test(rights)) return null;
  const [best] = line(input.fenBefore, [input.evalBefore.lines[0]?.moveSan ?? ''], 1);
  if (best?.piece === 'k') return null;
  return `${move.san} gives up castling for good`;
}

/** The stronger moves a fine move passed over, each with what it does:
 * "Bxe4 (takes the pawn on e4 and attacks the knight on b1), Nxe7 (takes the
 * bishop and develops the knight) were stronger". Two or more, each clearly
 * better than the played line (20 centipawns): one is the "Missed Bxe4" note. */
const STRONGER_MARGIN_CP = 20;

export function strongerCandidatesText(input: PrincipleInput): string | null {
  const playedCp = input.evalAfter?.lines[0]?.cp;
  if (playedCp === undefined || playedCp === null || input.evalAfter?.lines[0]?.mateIn) return null;
  const sign = input.fenBefore.split(' ')[1] === 'w' ? 1 : -1;
  const stronger = input.evalBefore.lines
    .filter((each) => each.moveSan !== input.moveSan && each.mateIn === null && each.cp !== null && sign * (each.cp - playedCp) >= STRONGER_MARGIN_CP)
    .slice(0, 3);
  if (stronger.length < 2) return null;
  const parts = stronger.map((each) => {
    const what = candidateDoes(input.fenBefore, each.moveSan);
    return what ? `${each.moveSan} (${what})` : each.moveSan;
  });
  const names = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${names} were stronger than ${input.moveSan}`;
}

/** What a move does beyond taking: "attacks the rook on b1" / "gives check",
 * or null. */
export function threatNote(fen: string, san: string): string | null {
  const [move] = line(fen, [san], 1);
  if (!move) return null;
  if (move.san.endsWith('+')) return 'gives check';
  const pin = pinNote(fen, move);
  if (pin) return pin;
  const target = newlyAttacked(fen, move);
  return target ? `attacks the ${PIECE_NAMES[target.type]} on ${target.square}` : null;
}

/** "pins the knight on c6 to the king" (the pin note, said as part of a sentence). */
function pinNote(fen: string, move: Move): string | null {
  const text = pinReason(fen, move.san, move.color === 'w' ? 'white' : 'black');
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : null;
}

function candidateDoes(fen: string, san: string): string | null {
  const [move] = line(fen, [san], 1);
  if (!move) return null;
  const parts: string[] = [];
  if (move.flags.includes('k') || move.flags.includes('q')) parts.push('castles');
  if (move.captured) parts.push(`takes the ${PIECE_NAMES[move.captured]} on ${move.to}`);
  if (isDevelopment(move)) parts.push(`develops the ${PIECE_NAMES[move.piece]}`);
  const target = move.san.endsWith('+') ? null : newlyAttacked(fen, move);
  const pin = pinNote(fen, move);
  if (move.san.endsWith('+')) parts.push('gives check');
  else if (pin) parts.push(pin);
  else if (target) parts.push(`attacks the ${PIECE_NAMES[target.type]} on ${target.square}`);
  const piling = pilesOnText(fen, move);
  if (piling && !move.captured) parts.push(piling);
  if (move.piece === 'p' && !move.captured && !target) {
    const lever = pawnLever(fen, move);
    if (lever) parts.push(lever);
  }
  if (move.piece === 'r' && !move.captured && !fileHasPawn(move)) parts.push(`puts the rook on the ${move.to[0]}-file, which has no pawns`);
  return parts.length ? parts.join(' and ') : null;
}

/** A pawn move that attacks an enemy pawn it did not attack before: the
 * break that challenges the centre. */
function pawnLever(fen: string, move: Move): string | null {
  const again = flipActiveColorFen(move.after);
  if (!again) return null;
  const board = new Chess(move.after);
  const before = capturesFrom(fen, move.from as Square);
  const square = [...capturesFrom(again, move.to as Square)].find((each) => !before.has(each) && board.get(each)?.type === 'p');
  return square ? `attacks the pawn on ${square}` : null;
}

/** Whether the rook's new file has a pawn on it. */
function fileHasPawn(move: Move): boolean {
  return new Chess(move.after).board().flat().some((piece) => piece?.type === 'p' && piece.square[0] === move.to[0]);
}

/** Squares of enemy pieces `square` can capture, with the side to move as in `fen`. */
function capturesFrom(fen: string, square: Square): Set<Square> {
  return new Set(
    new Chess(fen)
      .moves({ square, verbose: true })
      .filter((each) => each.captured)
      .map((each) => each.to as Square)
  );
}

/** The most valuable enemy piece the moved piece now attacks and didn't
 * before, when it is worth at least the attacker: hitting a pawn gains
 * nothing, and a knight "attacking" a pawn is not a threat to name. */
function newlyAttacked(fen: string, move: Move): { type: PieceSymbol; square: Square } | null {
  const again = flipActiveColorFen(move.after);
  if (!again) return null;
  const before = capturesFrom(fen, move.from as Square);
  const board = new Chess(move.after);
  const attackerValue = PIECE_VALUES[move.piece];
  return (
    [...capturesFrom(again, move.to as Square)]
      .filter((square) => !before.has(square))
      .flatMap((square) => {
        const piece = board.get(square);
        return piece && piece.type !== 'p' && piece.type !== 'k' && PIECE_VALUES[piece.type] >= attackerValue ? [{ type: piece.type, square }] : [];
      })
      .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type])[0] ?? null
  );
}

/** A trade whose retake develops the other side: the played move captures
 * with a developed piece, the reply takes back with one still at home. */
function tradeHelpsDevelopment(fen: string, playedLine: readonly string[], best: string, bestFragment: string | null): string | null {
  const [played, reply] = line(fen, playedLine, 2);
  if (!played?.captured || !reply?.captured || reply.to !== played.to || !isDevelopment(reply)) return null;
  if (!isMinor(played.piece) || played.from[1] === HOME_RANK[played.color]) return null;
  const traded = `${played.san} trades off a developed ${PIECE_NAMES[played.piece]} and lets ${reply.color === 'w' ? 'White' : 'Black'} bring out a ${PIECE_NAMES[reply.piece]} with ${reply.san}`;
  return bestFragment ? `${traded}; ${best} ${bestFragment}` : traded;
}

/** The moved piece is attacked by a developing reply and has to move again:
 * the tempo goes to the opponent. */
function chasedTwice(fen: string, playedLine: readonly string[], best: string): string | null {
  const moves = line(fen, playedLine, 7);
  const [first] = moves;
  if (!first || first.captured || !(isMinor(first.piece) || first.piece === 'q')) return null;
  for (let index = 2; index < moves.length; index += 2) {
    const again = moves[index];
    const chaser = moves[index - 1];
    if (!again || !chaser || again.from !== first.to || again.piece !== first.piece) continue;
    if (!isDevelopment(chaser) || !new Chess(chaser.after).isAttacked(first.to as Square, chaser.color)) return null;
    return `The ${PIECE_NAMES[first.piece]} on ${first.to} gets chased by ${chaser.san}, a developing move, and has to move again; ${best} avoids losing the time`;
  }
  return null;
}

/** The queen out while a minor piece is still at home, where the engine's
 * move brings that piece out. */
function queenOutEarly(fen: string, playedLine: readonly string[], best: string, bestFragment: string | null): string | null {
  const [played] = line(fen, playedLine, 1);
  if (!played || played.piece !== 'q' || played.captured || played.san.endsWith('+') || fullmoveOf(fen) > OPENING_LAST_MOVE) return null;
  // One step off the back rank (…Qe7) is not "out" yet.
  if (Math.abs(Number(played.to[1]) - Number(HOME_RANK[played.color])) < 2) return null;
  if (minorsAtHome(fen, played.color) === 0 || !developsAt(fen, best)) return null;
  const [bestMove] = line(fen, [best], 1);
  const what = bestFragment ?? `develops the ${bestMove ? PIECE_NAMES[bestMove.piece] : 'piece'}`;
  return `${best} was better: it ${what}, which the early ${played.san} puts off`;
}

/** The engine's own move is castling and the played one put it off. */
function castlesSooner(fen: string, played: string, best: string): string | null {
  const [move] = line(fen, [best], 1);
  const [own] = line(fen, [played], 1);
  if (fullmoveOf(fen) > OPENING_LAST_MOVE) return null;
  if (own?.flags.includes('k') || own?.flags.includes('q')) return null;
  return move && (move.flags.includes('k') || move.flags.includes('q')) ? `${best} was better: castling now gets the king safe` : null;
}
