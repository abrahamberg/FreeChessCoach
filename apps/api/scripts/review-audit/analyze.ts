import { parseCourseTree, parsePgn, renderCourseDossier, type CourseDossier, type CourseTree } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import { runAnalysisSteps } from '../../src/services/analysis-steps.js';
import { buildCourseDossierFromEngine } from '../../src/services/courses/dossier.js';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import { createStepTimer } from '../../src/services/step-timer.js';
import type { CorpusGame } from './corpus.js';

/** What the app shows or tells a model about one game: the review's moves
 * (exactly as the worker builds them) and the course dossier of the same
 * moves as a one-line course. */
export interface AnalysedGame {
  game: CorpusGame;
  reviewMoves: ClassifiedMoveDto[];
  evalsByFen: Map<string, EngineEval>;
  /** The course's own engine answers (three lines), by fen. */
  dossierEvals: Map<string, EngineEval>;
  dossier: CourseDossier;
  /** The dossier exactly as the course prompts get it. */
  dossierText: string;
  tree: CourseTree;
}

export async function analyseGame(game: CorpusGame, engine: EngineBackend): Promise<AnalysedGame> {
  const parsedGame = parsePgn(game.pgn);
  const fens = parsedGame.positions.map((position) => position.fen);
  // No options: the worker's own call (jobs/analyze-game.ts).
  const evals = await engine.analyzeGame(fens);
  const steps = await runAnalysisSteps(
    {
      gameId: game.id,
      userId: 'review-audit',
      userColor: game.readerSide,
      userRating: null,
      pgn: game.pgn,
      pgnResult: parsedGame.headers.Result ?? null,
      parsedGame,
      evals
    },
    createStepTimer()
  );
  const evalsByFen = new Map(evals.map((evaluation) => [evaluation.fen, evaluation]));
  const tree = parseCourseTree(game.pgn);
  const dossierEvals = new Map<string, EngineEval>();
  const recording: Pick<EngineBackend, 'analyzeGame'> = {
    async analyzeGame(positions, opts) {
      const found = await engine.analyzeGame(positions, opts);
      positions.forEach((fen, index) => {
        const each = found[index];
        if (each && !dossierEvals.has(fen)) dossierEvals.set(fen, each);
      });
      return found;
    }
  };
  const { dossier } = await buildCourseDossierFromEngine(tree, game.readerSide, recording, game.source === 'golden' ? null : 'master_game');
  return { game, reviewMoves: steps.gameReport.moves, evalsByFen, dossierEvals, dossier, dossierText: renderCourseDossier(dossier), tree };
}
