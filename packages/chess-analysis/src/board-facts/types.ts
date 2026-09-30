import type { PieceSymbol, Square } from 'chess.js';

export type Side = 'white' | 'black';

/** A piece and where it stands. */
export interface PieceAt {
  piece: PieceSymbol;
  square: Square;
}

/** One thing that is true on the board, as data. The builders in this folder
 * return these; `renderBoardFact` turns one into the sentence a prompt or a
 * review shows. Code that decides something reads `kind` and the fields,
 * never the sentence. */
export type BoardFact =
  | { kind: 'moved'; piece: PieceSymbol; from: Square; to: Square }
  | { kind: 'castles'; wing: 'kingside' | 'queenside' }
  | { kind: 'promotes'; piece: PieceSymbol }
  /** `square` is where the captured piece stood: beside the capturer for en passant. */
  | { kind: 'captures'; piece: PieceSymbol; square: Square; enPassant: boolean }
  | { kind: 'blocksCheck'; checker: PieceAt }
  | { kind: 'opposition' }
  /** `king` is the enemy king that cannot catch the moved passed pawn. */
  | { kind: 'outsideSquare'; king: { side: Side; square: Square } }
  | { kind: 'gives'; check: 'check' | 'checkmate' }
  /** A check by a piece other than the moved one. */
  | { kind: 'discoveredCheck'; checkers: PieceAt[] }
  /** A check by the moved piece and by these others. */
  | { kind: 'doubleCheck'; others: PieceAt[] }
  | { kind: 'backRankMate' }
  | {
      kind: 'mateNet';
      king: Square;
      checkers: PieceAt[];
      /** Squares next to the king that hold its own pieces. */
      ownSquares: Square[];
      /** Empty squares next to the king, grouped by who covers them. */
      covered: { squares: Square[]; by: PieceAt[] }[];
      /** Enemy pieces next to the king, and who guards each. */
      guarded: { piece: PieceAt; by: PieceAt[] }[];
    }
  /** The SAN of every way out of the check. */
  | { kind: 'checkAnswers'; blocks: string[]; captures: string[]; kingMoves: string[] }
  | {
      kind: 'attacks';
      piece: PieceAt;
      pinnedTo?: { target: PieceAt; by: PieceAt };
      /** `boxed`: it cannot move and nothing saves it; `nowhere`: every square it can reach loses it. */
      trapped?: 'boxed' | 'nowhere';
    }
  | { kind: 'leavesHanging'; piece: PieceAt; owner: Side; stalemateIfTaken: boolean }
  | { kind: 'forks'; piece: PieceAt; targets: PieceAt[] }
  | { kind: 'stopsGuarding'; piece: PieceSymbol; square: Square; replySan: string }
  | { kind: 'keepsSafe'; piece: PieceAt; newDefenders: PieceAt[] }
  | { kind: 'takesOutOfDanger'; piece: PieceAt }
  | { kind: 'repetition'; times: 2 | 3 };

export type BoardFactKind = BoardFact['kind'];
