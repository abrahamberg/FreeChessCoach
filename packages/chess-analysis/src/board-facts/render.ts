import { PIECE_NAMES } from '../piece-names.js';
import type { BoardFact, PieceAt } from './types.js';

const named = ({ piece, square }: PieceAt): string => `the ${PIECE_NAMES[piece]} on ${square}`;
const namedAll = (pieces: readonly PieceAt[]): string => pieces.map(named).join(' and ');

/** The sentence for one fact. This is the only place a fact's English lives. */
export function renderBoardFact(fact: BoardFact): string {
  switch (fact.kind) {
    case 'moved':
      return `moves the ${PIECE_NAMES[fact.piece]} from ${fact.from} to ${fact.to}`;
    case 'castles':
      return `castles ${fact.wing}`;
    case 'promotes':
      return `promotes to a ${PIECE_NAMES[fact.piece]}`;
    case 'captures':
      return `captures the ${PIECE_NAMES[fact.piece]} on ${fact.square}${fact.enPassant ? ' en passant' : ''}`;
    case 'blocksCheck':
      return `blocks the check from ${named(fact.checker)}`;
    case 'opposition':
      return 'takes the opposition: the kings face each other with one square between, and the other king must give way';
    case 'outsideSquare':
      return `the ${fact.king.side} king on ${fact.king.square} is outside the pawn's square: it cannot catch the pawn`;
    case 'gives':
      return `gives ${fact.check}`;
    case 'discoveredCheck':
      return `a discovered check from ${namedAll(fact.checkers)}`;
    case 'doubleCheck':
      return `a double check, with ${namedAll(fact.others)}`;
    case 'backRankMate':
      return 'a back-rank mate';
    case 'mateNet':
      return renderMateNet(fact);
    case 'checkAnswers':
      return renderCheckAnswers(fact);
    case 'attacks': {
      const trapped = fact.trapped === 'boxed' ? ', which is trapped: it cannot move, and no move saves it' : fact.trapped === 'nowhere' ? ', which is trapped: every square it can reach loses it' : '';
      return `attacks ${renderAttackTarget(fact)}${trapped}`;
    }
    case 'leavesHanging':
      return `leaves the ${fact.owner} ${PIECE_NAMES[fact.piece.piece]} on ${fact.piece.square} hanging${fact.stalemateIfTaken ? ': taking it is stalemate' : ''}`;
    case 'forks':
      return `${named(fact.piece)} forks ${namedAll(fact.targets)}`;
    case 'stopsGuarding':
      return `the ${PIECE_NAMES[fact.piece]} stops guarding ${fact.square}, where ${fact.replySan} follows`;
    case 'keepsSafe': {
      const names = fact.newDefenders.map(named);
      const how = names.length ? `: ${names.join(' and ')} now ${names.length > 1 ? 'defend' : 'defends'} it` : '';
      return `keeps the ${PIECE_NAMES[fact.piece.piece]} on ${fact.piece.square} safe${how}`;
    }
    case 'takesOutOfDanger':
      return `takes the ${PIECE_NAMES[fact.piece.piece]} out of danger on ${fact.piece.square}`;
    case 'repetition':
      return fact.times === 3 ? 'the position has now come three times: a draw by repetition' : 'the position has now come twice: a third time is a draw';
  }
}

/** The attacked piece, with its pin: "the knight on f6, which is pinned to the king by the bishop on b5". */
export function renderAttackTarget(fact: Extract<BoardFact, { kind: 'attacks' }>): string {
  return `${named(fact.piece)}${fact.pinnedTo ? `, which is pinned to ${renderPinTarget(fact.pinnedTo)}` : ''}`;
}

/** "the king by the bishop on b5", or "the queen on d8 by the bishop on g5". */
function renderPinTarget({ target, by }: { target: PieceAt; by: PieceAt }): string {
  return target.piece === 'k' ? `the king by ${named(by)}` : `${named(target)} by ${named(by)}`;
}

function renderMateNet(fact: Extract<BoardFact, { kind: 'mateNet' }>): string {
  const parts = [`the king on ${fact.king} is checked by ${namedAll(fact.checkers)}`];
  const { ownSquares } = fact;
  if (ownSquares.length) parts.push(`${ownSquares.join(', ')} ${ownSquares.length > 1 ? 'hold' : 'holds'} its own pieces`);
  for (const { squares, by } of fact.covered) parts.push(`${squares.join(' and ')} ${squares.length > 1 ? 'are' : 'is'} covered by ${namedAll(by)}`);
  for (const { piece, by } of fact.guarded) parts.push(`${named(piece)} is guarded by ${namedAll(by)}`);
  return `why it is mate: ${parts.join('; ')}`;
}

function renderCheckAnswers({ blocks, captures, kingMoves }: Extract<BoardFact, { kind: 'checkAnswers' }>): string {
  const ways = [
    blocks.length ? `block with ${blocks.join(', ')}` : 'no block',
    captures.length ? `take the checking piece with ${captures.join(', ')}` : 'the checking piece cannot be taken',
    kingMoves.length ? `move the king with ${kingMoves.join(', ')}` : 'the king cannot move'
  ];
  return `the check can be answered: ${ways.join('; ')}`;
}
