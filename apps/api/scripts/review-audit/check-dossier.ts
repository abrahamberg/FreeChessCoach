import type { BoardFact, PieceAt } from '@freechesscoach/chess-analysis';
import { Chess, type Square } from 'chess.js';
import { result } from './check-result.js';
import { attackersOf, balance, colorOf, exchangeGain, inCheck, isCheckmate, kingSquare, legalCapturesOf, other, pieceAt, play, playLine, turnOf } from './oracle.js';
import type { AuditItem, AuditPosition, CheckResult } from './types.js';

/** Checks for the dossier's rows. Board facts are data, so these read the
 * fact's fields, never its sentence. */
export function checkDossierFact(item: AuditItem, position: AuditPosition): CheckResult[] {
  if (item.source.startsWith('dossier:board:')) return boardFactChecks(item.data as BoardFact, position);
  if (item.source.startsWith('dossier:why-better:')) return betterFactChecks(item.data as BoardFact, position);
  if (item.source === 'dossier:best-instead') return bestInsteadChecks(item.data as { san: string; line: string[]; balance: string }, position);
  if (item.source.startsWith('dossier:tempting:')) return temptingChecks(item.data as { san: string; refutation: string[]; balance: string }, position);
  return [];
}

function boardFactChecks(fact: BoardFact, position: AuditPosition): CheckResult[] {
  const { fenBefore, fenAfter } = position;
  const mover = colorOf(position.mover);
  const move = new Chess(fenBefore).move(position.san);
  switch (fact.kind) {
    case 'moved':
      return [result('moved', move.from === fact.from && move.to === fact.to && move.piece === fact.piece, `the move is ${move.piece} ${move.from}-${move.to}`)];
    case 'castles':
      return [result('castles', move.isKingsideCastle() === (fact.wing === 'kingside') && (move.isKingsideCastle() || move.isQueensideCastle()), 'the move is not that castling')];
    case 'promotes':
      return [result('promotes', move.promotion === fact.piece, 'the move does not promote to that piece')];
    case 'captures':
      return [result('captures', move.captured === fact.piece && pieceAt(fenBefore, fact.square)?.type === fact.piece, `the move captures ${move.captured ?? 'nothing'}`)];
    case 'gives':
      return [result('gives', fact.check === 'checkmate' ? isCheckmate(fenAfter) : inCheck(fenAfter) && !isCheckmate(fenAfter), `after the move: ${isCheckmate(fenAfter) ? 'mate' : inCheck(fenAfter) ? 'check' : 'no check'}`)];
    case 'blocksCheck':
      return [result('blocks-check', inCheck(fenBefore) && !inCheck(fenAfter) && move.piece !== 'k' && move.to !== fact.checker.square, 'the move is not a block')];
    case 'discoveredCheck':
    case 'doubleCheck':
      return [checkersCheck(fact, position)];
    case 'checkAnswers':
      return [checkAnswersCheck(fact, fenAfter)];
    case 'attacks':
      return [
        result('attacks', pieceAt(fenAfter, fact.piece.square)?.color === other(mover) && attackersOf(fenAfter, fact.piece.square, mover).includes(move.to), `the moved piece on ${move.to} does not attack ${fact.piece.square}`),
        ...(fact.pinnedTo ? [pinCheck(fenAfter, fact.piece, fact.pinnedTo.target, fact.pinnedTo.by)] : [])
      ];
    case 'leavesHanging': {
      const owner = colorOf(fact.owner);
      return [
        result('can-be-taken', pieceAt(fenAfter, fact.piece.square)?.color === owner && legalCapturesOf(fenAfter, fact.piece.square, other(owner)).length > 0, `nothing can legally take on ${fact.piece.square}`),
        result('can-be-won', exchangeGain(fenAfter, fact.piece.square, other(owner)) > 0, `taking on ${fact.piece.square} wins nothing over the exchange`)
      ];
    }
    case 'forks': {
      const misses = fact.targets.filter((target) => !attackersOf(fenAfter, target.square, mover).includes(fact.piece.square));
      return [result('fork-geometry', misses.length === 0, `${fact.piece.square} does not hit ${misses.map((target) => target.square).join(', ')}`)];
    }
    case 'stopsGuarding': {
      const before = attackersOf(fenBefore, fact.square, mover).includes(move.from);
      const after = attackersOf(fenAfter, fact.square, mover).includes(move.to);
      return [result('guard-lost', before && !after, `the piece guarded ${fact.square}: before ${before}, after ${after}`), result('named-move', play(fenAfter, fact.replySan) !== null, `${fact.replySan} is not legal`)];
    }
    case 'backRankMate': {
      const king = kingSquare(fenAfter, turnOf(fenAfter)) ?? '';
      return [result('back-rank-mate', isCheckmate(fenAfter) && ['1', '8'].includes(king[1] ?? ''), 'not a mate on the back rank')];
    }
    case 'mateNet':
      return [result('mate', isCheckmate(fenAfter), 'not checkmate')];
    case 'opposition':
      return [oppositionCheck(fenAfter)];
    default:
      return [];
  }
}

function checkersCheck(fact: Extract<BoardFact, { kind: 'discoveredCheck' | 'doubleCheck' }>, position: AuditPosition): CheckResult {
  const { fenAfter } = position;
  const king = kingSquare(fenAfter, turnOf(fenAfter)) ?? '';
  const checkers = attackersOf(fenAfter, king, other(turnOf(fenAfter)));
  const named = fact.kind === 'discoveredCheck' ? fact.checkers : fact.others;
  const ok = named.every((each) => checkers.includes(each.square)) && (fact.kind === 'discoveredCheck' || checkers.length >= 2);
  return result(fact.kind, ok, `the checkers are ${checkers.join(', ') || 'none'}`);
}

function checkAnswersCheck(fact: Extract<BoardFact, { kind: 'checkAnswers' }>, fen: string): CheckResult {
  const moves = new Chess(fen).moves({ verbose: true });
  const kingMoves = moves.filter((move) => move.piece === 'k').map((move) => move.san);
  const captures = moves.filter((move) => move.piece !== 'k' && move.captured).map((move) => move.san);
  const blocks = moves.filter((move) => move.piece !== 'k' && !move.captured).map((move) => move.san);
  const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((each) => b.includes(each));
  // A king that takes the checker counts as a king move here and in the fact.
  const ok = same(fact.blocks, blocks) && same(fact.captures, captures) && same(fact.kingMoves, kingMoves);
  return result('check-answers', ok, `legal answers: blocks ${blocks.join(' ') || '-'}; captures ${captures.join(' ') || '-'}; king ${kingMoves.join(' ') || '-'}`);
}

/** The pinned piece stands between the pinner and the target, on one line, nothing else between. */
function pinCheck(fen: string, pinned: PieceAt, target: PieceAt, by: PieceAt): CheckResult {
  const board = new Chess(fen);
  const exists = [pinned, target, by].every((each) => board.get(each.square as Square)?.type === each.piece);
  const behind = new Chess(fen);
  behind.remove(pinned.square as Square);
  const opened = exists && behind.attackers(target.square as Square, board.get(by.square as Square)?.color ?? 'w').includes(by.square as Square);
  return result('pin-geometry', opened, `removing ${pinned.square} does not open ${by.square} onto ${target.square}`);
}

function oppositionCheck(fen: string): CheckResult {
  const white = kingSquare(fen, 'w') ?? 'a1';
  const black = kingSquare(fen, 'b') ?? 'a1';
  const files = Math.abs(white.charCodeAt(0) - black.charCodeAt(0));
  const ranks = Math.abs(Number(white[1]) - Number(black[1]));
  return result('opposition', (files === 0 && ranks === 2) || (ranks === 0 && files === 2), `kings on ${white} and ${black}`);
}

function betterFactChecks(fact: BoardFact, position: AuditPosition): CheckResult[] {
  if (fact.kind !== 'keepsSafe' && fact.kind !== 'takesOutOfDanger') return [];
  return [result('own-piece', pieceAt(position.fenBefore, fact.kind === 'keepsSafe' ? fact.piece.square : fact.piece.square)?.type !== undefined || fact.kind === 'takesOutOfDanger', `nothing on ${fact.piece.square}`)];
}

function bestInsteadChecks(best: { san: string; line: string[]; balance: string }, position: AuditPosition): CheckResult[] {
  const { fens, legal } = playLine(position.fenBefore, best.line);
  return [result('named-line', legal, `${best.line.join(' ')} is not legal`), balanceCheck(best.balance, fens[fens.length - 1] ?? position.fenBefore)];
}

function temptingChecks(tempting: { san: string; refutation: string[]; balance: string }, position: AuditPosition): CheckResult[] {
  const { fens, legal } = playLine(position.fenBefore, [tempting.san, ...tempting.refutation]);
  return [result('named-line', legal, `${tempting.san} ${tempting.refutation.join(' ')} is not legal`), balanceCheck(tempting.balance, fens[fens.length - 1] ?? position.fenBefore)];
}

/** "material is level" / "White is a pawn up" / "Black has a knight for two pawns" against the board at the line's end. */
function balanceCheck(words: string, fen: string): CheckResult {
  const points = balance(fen);
  const ahead = /^(White|Black) is .* up$/.exec(words)?.[1];
  const ok = words === 'material is level' ? points === 0 : ahead === 'White' ? points > 0 : ahead === 'Black' ? points < 0 : true;
  return result('balance', ok, `"${words}" but the material at the line's end is ${points > 0 ? '+' : ''}${points} for White`);
}
