import type { ClassifiedMoveDto, GameReport, TacticBaselineNoteDto } from '@freechesscoach/shared';

/** What Game Review shows: a game and its analysis, wherever the analysis
 * was made (a stored game's, or the no-account review's in the browser). */
export interface ReviewedGame {
  pgn: string;
  /** The side at the bottom of the board, the player the review is for. */
  userColor: 'white' | 'black';
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  /** Every move's verdict and notes, by ply. */
  classifiedMoves: ClassifiedMoveDto[];
  gameReport: GameReport | null;
  /** The game-level tactic note against the player's own record, if any. */
  tacticBaseline: TacticBaselineNoteDto | null;
}
