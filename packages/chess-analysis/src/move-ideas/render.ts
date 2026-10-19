import { capitalise } from '@freechesscoach/shared';
import type { PieceAt } from '../board-facts/types.js';
import { PIECE_NAMES } from '../piece-names.js';
import { materialWords } from '../board-facts/material.js';
import type { MoveIdea, PreventedBecause } from './types.js';

const the = (piece: PieceAt): string => `the ${PIECE_NAMES[piece.piece]} on ${piece.square}`;
const list = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const times = (count: number): string => (count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`);
const pieces = (count: number): string => `${count} piece${count === 1 ? '' : 's'}`;

const PREVENTED: Record<PreventedBecause, string> = {
  check: 'a check',
  pin: 'a pin',
  attack: 'an attack on a bigger piece',
  break: 'a pawn break',
  invade: 'an invasion',
  advance: 'a pawn advance',
  outpost: 'a knight on a strong square'
};

/** One idea as a phrase that can follow "The move …": lower case, no full stop. */
export function renderMoveIdea(idea: MoveIdea): string {
  switch (idea.kind) {
    case 'develops':
      return idea.piece.piece === 'q' ? `brings the queen out to ${idea.piece.square}` : `develops the ${PIECE_NAMES[idea.piece.piece]} to ${idea.piece.square}${idea.natural ? ', its most useful square' : ''}`;
    case 'clearsCastling':
      return `clears the way to castle ${idea.wing}`;
    case 'castles':
      return `castles ${idea.wing}: the king goes to safety and the rook comes to ${idea.rook}`;
    case 'developmentLead':
      return `${capitalise(idea.leader)} now has ${pieces(idea.leaderCount)} developed to ${pieces(idea.otherCount)}`;
    case 'movesAgain':
      return `moves the ${PIECE_NAMES[idea.piece.piece]} for the ${ordinal(idea.times)} time while ${pieces(idea.undeveloped)} still wait at home`;
    case 'blocksPawn':
      return `${the(idea.piece)} blocks the pawn on ${idea.pawn}`;
    case 'takesKnightSquare':
      return `takes ${idea.square} from the knight, whose natural square it is`;
    case 'earlyQueen':
      return `brings the queen out early, with ${pieces(idea.undeveloped)} still at home`;
    case 'occupiesCentre':
      return `puts a pawn in the centre on ${idea.square}`;
    case 'controlsCentre':
      return [idea.pressures.length ? `puts pressure on the pawn${idea.pressures.length > 1 ? 's' : ''} on ${list(idea.pressures)}` : '', idea.squares.length ? `controls ${list(idea.squares)}` : ''].filter(Boolean).join(' and ');
    case 'supportsCentre':
      return `supports the centre pawn on ${idea.pawn}`;
    case 'strikesCentre':
      return `strikes at the centre: attacks the pawn on ${idea.target}`;
    case 'centralises':
      return `centralises ${the(idea.piece)}, which reaches ${idea.reach} squares`;
    case 'givesUpCentre':
      return `gives up the centre: the pawn leaves ${idea.from}`;
    default:
      return renderLater(idea);
  }
}

function renderLater(idea: MoveIdea): string {
  switch (idea.kind) {
    case 'opensLine':
      return `opens ${the(idea.piece)} (from ${idea.before} squares to ${idea.after})`;
    case 'shutsIn':
      return `shuts in ${the(idea.piece)} (from ${idea.before} squares to ${idea.after})`;
    case 'opensEnemyLine':
      return `opens a line for the opponent's ${PIECE_NAMES[idea.piece.piece]} on ${idea.piece.square} (from ${idea.before} squares to ${idea.after})`;
    case 'longDiagonal':
      return `puts the bishop on the long diagonal`;
    case 'aimsAt':
      return aimsAtText(idea);
    case 'rookFile':
      return `puts a rook on the ${idea.open ? 'open' : 'half-open'} ${idea.file}-file`;
    case 'rookToCentre':
      return `brings the rook to the ${idea.file}-file, in the centre where files open first`;
    case 'connectsRooks':
      return `connects the rooks`;
    case 'opensFile':
      return `opens the ${idea.file}-file for the rooks${idea.open ? '' : ' (half-open)'}`;
    case 'battery':
      return `lines up ${PIECE_NAMES[idea.back.piece] === 'queen' ? 'queen behind bishop' : 'bishop behind queen'}, aimed at ${idea.target}`;
    case 'fianchetto':
      return `fianchettoes the bishop on ${idea.piece.square}, on the long diagonal`;
    case 'doubles':
      return idea.pieces.every((each) => each.piece === 'r') ? `doubles the rooks on the ${idea.line}` : `lines up queen and rook on the ${idea.line}`;
    case 'seventhRank':
      return `puts the rook on the seventh rank`;
    case 'threatensMate':
      return idea.line.length === 1 ? `threatens mate with ${idea.line[0]}` : `threatens mate in two: ${idea.line.join(' ')}`;
    case 'threatensMaterial':
      return `threatens to win ${the(idea.target)} with ${idea.san}`;
    case 'pilesOn':
      return `attacks ${the(idea.target)} ${times(idea.attackers)}, while ${idea.defenders === 0 ? 'nothing defends it' : `it is defended ${times(idea.defenders)}`}`;
    case 'pinnedCannotTake':
      return `${the(idea.pinned)} cannot take it: it is pinned by ${the(idea.by)}`;
    case 'pins':
      return `pins ${the(idea.pinned)} to the ${PIECE_NAMES[idea.to.piece]}`;
    case 'keepsPin':
      return `keeps the pin on ${the(idea.pinned)}`;
    case 'leavesPinned':
      return `leaves ${the(idea.pinned)} pinned to the ${PIECE_NAMES[idea.to.piece]}`;
    case 'kicks':
      return `attacks ${the(idea.target)}${idea.pinning ? `, which pins ${the(idea.pinning)}` : ''}`;
    default:
      return renderDefence(idea);
  }
}

function renderDefence(idea: MoveIdea): string {
  switch (idea.kind) {
    case 'stopsMate':
      return `stops the mate threat ${idea.line.join(' ')}`;
    case 'saves':
      return renderSaves(idea);
    case 'prevents':
      return `prevents ${idea.san}, ${PREVENTED[idea.because]}`;
    case 'defends':
      return `defends ${the(idea.piece)}, attacked ${times(idea.attackers)} and now defended ${times(idea.defenders)}`;
    case 'unpins':
      return `breaks the pin on ${the(idea.piece)}`;
    case 'weakensShield':
      return idea.holes.length ? `loosens the pawns in front of the king: no pawn can cover ${list(idea.holes)} any more` : `loosens the pawns in front of the king, and the pawn on ${idea.pawn} can become a target`;
    case 'breaksShield':
      return `breaks into the pawns in front of the king (the pawn on ${idea.pawn})`;
    case 'removesDefender':
      return idea.guarded === 'king' ? `removes ${the(idea.piece)}, a defender of the king` : `removes ${the(idea.piece)}, the guard of ${the(idea.guarded)}`;
    case 'guardsKing':
      return `puts the knight on ${idea.piece.square}, the best defender of a king castled short`;
    case 'joinsAttack':
      return `brings the ${PIECE_NAMES[idea.piece.piece]} into the attack: it bears on ${idea.kingSquares} squares around the king`;
    case 'flightSquare':
      return `gives the king a flight square on ${idea.square}`;
    case 'takesFlightSquare':
      return `takes ${idea.square} from the enemy king`;
    case 'leavesKing':
      return `takes ${the(idea.piece)} away from the defence of its own king`;
    case 'stopsCastling':
      return `keeps the king from castling ${idea.wing}: ${idea.square} is covered`;
    case 'losesCastling':
      return `gives up castling for good`;
    case 'activatesKing':
      return idea.invades ? `marches the king into the enemy half, to ${idea.square}` : `brings the king toward the centre, a strong piece in the ending`;
    case 'restricts':
      return `leaves ${the(idea.piece)} ${idea.moves === 0 ? 'without a move' : 'with a single move'}`;
    default:
      return renderStructure(idea);
  }
}

function renderStructure(idea: MoveIdea): string {
  switch (idea.kind) {
    case 'outpost':
      return `${idea.secure ? `puts ${the(idea.piece)} on an outpost no pawn can attack` : `posts ${the(idea.piece)} on a strong square`}${idea.supportedBy ? `, supported by the pawn on ${idea.supportedBy}` : ''}`;
    case 'occupiesHole':
      return `settles ${the(idea.piece)} on a square by the king that no pawn can cover any more`;
    case 'blockades':
      return `blockades the pawn on ${idea.pawn}`;
    case 'pawnStorm':
      return `advances the pawn to ${idea.pawn}, toward the enemy king`;
    case 'passedPawn':
      return idea.created ? `creates a passed pawn on ${idea.square}` : `pushes the passed pawn to ${idea.square}, ${idea.toGo} square${idea.toGo === 1 ? '' : 's'} from queening`;
    case 'pawnWeakness':
      return idea.weakness === 'doubled' ? `leaves ${capitalise(idea.owner)} with doubled pawns on the ${list(idea.where)}-file` : `leaves ${capitalise(idea.owner)} with an isolated pawn on ${list(idea.where)}`;
    case 'forcesWeakness':
      return idea.weakness === 'doubled' ? `after ${idea.reply} the opponent's pawns are doubled on the ${list(idea.where)}-file` : `after ${idea.reply} the opponent has an isolated pawn on ${list(idea.where)}`;
    case 'fixesPawn':
      return `fixes the pawn on ${idea.pawn}: it can no longer advance`;
    case 'majority':
      return `leaves a ${idea.own}-to-${idea.theirs} pawn majority on the ${idea.wing}`;
    case 'gainsSpace':
      return idea.cramps ? `gains space: the pawn on ${idea.square} takes a natural square from the knight` : `gains space with the pawn on ${idea.square}`;
    case 'sacrifices':
      return idea.piece.piece === 'p' ? `offers the pawn on ${idea.piece.square}: it can be taken, and the engine still approves` : `sacrifices ${the(idea.piece)}: it can be taken, and the engine still approves`;
    case 'materialBalance':
      return `after the exchange ${lowerFirst(materialWords(idea.fen))}`;
    case 'tradesWhenAhead':
      return `trades pieces while ahead in material`;
    case 'recapturesTowardCentre':
      return `takes toward the centre`;
    case 'bishopPair':
      return idea.gains ? `keeps the two bishops` : `gives up the bishop pair`;
    case 'preparesPush':
      return `prepares the pawn's advance to ${idea.to}, which it now supports`;
    case 'preparesFianchetto':
      return `makes room for the bishop on ${idea.bishop} to fianchetto on ${idea.to}`;
    case 'eyesOutpost':
      return `heads for ${idea.square}, a square no enemy pawn can attack`;
    case 'prepares':
      return `prepares ${idea.san}${idea.how === 'supports' ? ', which it now supports' : idea.how === 'clears' ? ' by clearing the way' : ' by opening the line'}`;
    default:
      return '';
  }
}

function ordinal(count: number): string {
  return ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][count] ?? `${count}th`;
}

function renderSaves(idea: Extract<MoveIdea, { kind: 'saves' }>): string {
  const piece = PIECE_NAMES[idea.piece.piece];
  if (idea.how === 'moves') return `takes the attacked ${piece} to safety on ${idea.piece.square}`;
  if (idea.how === 'takes') return `takes the piece that attacked the ${piece} on ${idea.piece.square}`;
  if (idea.how === 'defends') return `defends the ${piece} on ${idea.piece.square}, which was attacked`;
  if (idea.how === 'blocks') return `blocks the attack on the ${piece} on ${idea.piece.square}`;
  return `answers the attack on the ${piece} on ${idea.piece.square} with a counter-threat`;
}

const lowerFirst = (text: string): string => (text.startsWith('White') || text.startsWith('Black') ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`);

function aimsAtText(idea: Extract<MoveIdea, { kind: 'aimsAt' }>): string {
  const through = idea.through ? `, through ${the(idea.through)}` : '';
  const only = idea.onlyKingDefends ? ', which only the king defends' : '';
  return `aims at ${the(idea.target)}${through}${only}`;
}
