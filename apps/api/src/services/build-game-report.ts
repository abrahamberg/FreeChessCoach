import {
  buildGameReport as assembleGameReport,
  type GameResultForColour,
  type ParsedGame
} from '@freechesscoach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH } from '@freechesscoach/shared';
import type { BookReport, ClassifiedMoveDto, EngineEval, GameReport, TacticMotifType } from '@freechesscoach/shared';
import { ENGINE_MULTI_PV } from './engine-client.js';

const ENGINE_NAME = 'stockfish';

export interface BuildGameReportForAnalysisInput {
  game: ParsedGame;
  evals: EngineEval[];
  moves: ClassifiedMoveDto[];
  book: BookReport;
  /** The PGN `Result` header — `'1-0'`, `'0-1'`, `'1/2-1/2'`, or an
   * unfinished-game marker like `'*'`. */
  pgnResult: string | null;
  /** From `computeTacticMotifPrevented` — optional since it's an
   * engine-gated step the caller may skip or that may fail independently of
   * the rest of this report (see tactic-prevention.ts). */
  preventedCounts?: Record<'white' | 'black', Partial<Record<TacticMotifType, number>>>;
  /** From the same `computeTacticMotifPrevented` call — the denominator
   * `preventedCounts` is a subset of. */
  preventableCounts?: Record<'white' | 'black', Partial<Record<TacticMotifType, number>>>;
  /** The game's own player (Task 5's userColor) and their numeric profile
   * rating (Task 51.5's users.rating), if known. Only the student's own
   * colour ever gets a real prior here — we don't have a stored profile
   * rating for the opponent, who usually isn't even a user of this app. */
  userColor: 'white' | 'black';
  userRating: number | null;
}

/**
 * Wraps the pure chess-analysis assembler with what's only knowable at the
 * API layer: the engine's identity, the depth actually achieved by this
 * analysis, and each colour's game outcome (from the PGN Result tag).
 *
 * `priorRating` feeds the student's own numeric rating (when known) into
 * §8.5's shrink; the opponent's side is always `null` — see this input's own
 * doc comment.
 */
export function buildGameReportForAnalysis(input: BuildGameReportForAnalysisInput): GameReport {
  return assembleGameReport({
    game: input.game,
    evals: input.evals,
    moves: input.moves,
    book: input.book,
    engine: {
      name: ENGINE_NAME,
      depth: input.evals[0]?.depth ?? ENGINE_DEFAULT_DEPTH,
      multiPv: ENGINE_MULTI_PV
    },
    priorRating: {
      white: input.userColor === 'white' ? input.userRating : null,
      black: input.userColor === 'black' ? input.userRating : null
    },
    result: {
      white: resultForColour(input.pgnResult, 'white'),
      black: resultForColour(input.pgnResult, 'black')
    },
    preventedCounts: input.preventedCounts,
    preventableCounts: input.preventableCounts
  });
}

/** An unfinished or unrecognised result (`'*'`, `null`) has no winner to
 * report — 'draw' is the neutral entry in §7.4's conversion table, so it
 * neither rewards nor penalizes either colour's endgame conversion. Exported
 * for reuse by the stats dashboard service (Task 29.2), which needs the
 * same PGN-result-to-outcome mapping for `StatsEntry.result`. */
export function resultForColour(pgnResult: string | null, colour: 'white' | 'black'): GameResultForColour {
  if (pgnResult === '1-0') return colour === 'white' ? 'win' : 'loss';
  if (pgnResult === '0-1') return colour === 'black' ? 'win' : 'loss';
  return 'draw';
}
