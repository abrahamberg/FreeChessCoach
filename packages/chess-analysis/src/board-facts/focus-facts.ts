import { Chess, type Color } from 'chess.js';
import { opponentOf } from '../attack-map.js';
import { replayMove } from '../inspect-move.js';
import { loosePieces, type LoosePiece } from './loose-pieces.js';
import { boardFacts } from './move-facts.js';
import { canBeTaken } from './safety.js';
import type { BoardFact, PieceAt } from './types.js';

/** Extra facts for what the student is working on. Each field is set only
 * when a focus area asks for it (`FOCUS_FACTS`), and only for the student's
 * own moves. Nothing here is a verdict: the lists are "to look at". */
export interface FocusFacts {
  /** BV-01, BV-04, BV-22, MS-14: pieces either side could win, before and after the move. */
  loose?: { before: LoosePiece[]; after: LoosePiece[] };
  /** MS-01..03: what the opponent can do next. */
  opponentNext?: MoveOptions;
  /** MS-04..06: what the student could have done before the move. */
  ownBefore?: MoveOptions;
  /** BV-15, MS-08: whether the piece's new square is safe (the whole exchange, `see`). */
  newSquare?: { piece: PieceAt; safe: boolean };
  /** EG-*: the opposition and the rule of the square, when the move makes them. */
  endgame?: BoardFact[];
}

/** Checks and captures as SAN, and the pieces the side to move could win. */
export interface MoveOptions {
  checks: string[];
  captures: string[];
  threats: LoosePiece[];
}

type Section = 'loose' | 'opponentNext' | 'ownBefore' | 'newSquare' | 'endgame';

const FOCUS_FACTS: { match: (code: string) => boolean; section: Section }[] = [
  { match: (code) => ['BV-01', 'BV-04', 'BV-22', 'MS-14'].includes(code), section: 'loose' },
  { match: (code) => ['MS-01', 'MS-02', 'MS-03'].includes(code), section: 'opponentNext' },
  { match: (code) => ['MS-04', 'MS-05', 'MS-06'].includes(code), section: 'ownBefore' },
  { match: (code) => ['BV-15', 'MS-08'].includes(code), section: 'newSquare' },
  { match: (code) => code.startsWith('EG-'), section: 'endgame' }
];

const MOST_LISTED = 6;

export interface FocusFactsInput {
  fenBefore: string;
  playedSan: string;
  student: 'white' | 'black';
  /** Diagnosis codes of the student's active focus areas. */
  codes: readonly string[];
}

/** Null for a move that is not the student's own, or when no focus area asks for facts. */
export function focusFacts({ fenBefore, playedSan, student, codes }: FocusFactsInput): FocusFacts | null {
  const color: Color = student === 'white' ? 'w' : 'b';
  if (new Chess(fenBefore).turn() !== color) return null;
  const sections = new Set(FOCUS_FACTS.filter(({ match }) => codes.some(match)).map(({ section }) => section));
  const played = sections.size ? replayMove(fenBefore, playedSan) : null;
  if (!played) return null;
  const facts: FocusFacts = {};
  const both = (fen: string): LoosePiece[] => [...loosePieces(fen, 'w'), ...loosePieces(fen, 'b')];
  if (sections.has('loose')) facts.loose = { before: both(fenBefore), after: both(played.resultFen) };
  if (sections.has('opponentNext')) facts.opponentNext = options(played.resultFen, color);
  if (sections.has('ownBefore')) facts.ownBefore = options(fenBefore, opponentOf(color));
  if (sections.has('newSquare')) facts.newSquare = { piece: { piece: played.piece, square: played.to as PieceAt['square'] }, safe: !canBeTaken(played.resultFen, played.to) };
  if (sections.has('endgame')) facts.endgame = boardFacts(fenBefore, playedSan).filter((fact) => fact.kind === 'opposition' || fact.kind === 'outsideSquare');
  return facts;
}

/** What the side to move in `fen` can check, capture, or win; `victim` is the side it attacks. */
function options(fen: string, victim: Color): MoveOptions {
  const moves = new Chess(fen).moves({ verbose: true });
  return {
    checks: moves.filter((move) => move.san.endsWith('+') || move.san.endsWith('#')).map((move) => move.san).slice(0, MOST_LISTED),
    captures: moves.filter((move) => move.captured).map((move) => move.san).slice(0, MOST_LISTED),
    threats: loosePieces(fen, victim)
  };
}
