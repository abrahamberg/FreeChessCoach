import {
  buildGameReport as assembleGameReport,
  type GameResultForColour,
  type ParsedGame
} from '@chess-coach/chess-analysis';
import { ENGINE_DEFAULT_DEPTH } from '@chess-coach/shared';
import type { BookReport, ClassifiedMoveDto, EngineEval, GameReport } from '@chess-coach/shared';
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
}

/**
 * Wraps the pure chess-analysis assembler with what's only knowable at the
 * API layer: the engine's identity, the depth actually achieved by this
 * analysis, and each colour's game outcome (from the PGN Result tag).
 *
 * `priorRating` is always `null` for both colours — no numeric player rating
 * exists yet (users only have a coarse `ratingBand` enum; see docs/plan.md's
 * Phase 19 notes), so §8.5's shrink always falls back to the default prior
 * until a numeric rating is available to plug in here.
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
    priorRating: { white: null, black: null },
    result: {
      white: resultForColour(input.pgnResult, 'white'),
      black: resultForColour(input.pgnResult, 'black')
    }
  });
}

/** An unfinished or unrecognised result (`'*'`, `null`) has no winner to
 * report — 'draw' is the neutral entry in §7.4's conversion table, so it
 * neither rewards nor penalizes either colour's endgame conversion. */
function resultForColour(pgnResult: string | null, colour: 'white' | 'black'): GameResultForColour {
  if (pgnResult === '1-0') return colour === 'white' ? 'win' : 'loss';
  if (pgnResult === '0-1') return colour === 'black' ? 'win' : 'loss';
  return 'draw';
}
