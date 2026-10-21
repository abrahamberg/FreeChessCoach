import { parseCourseTree, parsePgn, renderCourseDossier, type CourseDossier, type CourseTree } from '@freechesscoach/chess-analysis';
import { ENGINE_MULTI_PV, REVIEW_MULTI_PV, type ClassifiedMoveDto, type EngineEval } from '@freechesscoach/shared';
import { runAnalysisSteps } from '../../src/services/analysis-steps.js';
import { widenBrilliantCandidates } from '../../src/services/analysis-widen.js';
import { buildCourseDossierFromEngine } from '../../src/services/courses/dossier.js';
import type { EngineBackend } from '../../src/services/engine/engine-backend.js';
import { scanPasses } from '../../src/services/pass-scans.js';
import { createStepTimer } from '../../src/services/step-timer.js';
import type { CorpusGame } from './corpus.js';

/** What the app shows or tells a model about one game: the review's moves
 * (exactly as the worker builds them) and the course dossier of the same
 * moves as a one-line course. */
export interface AnalysedGame {
  game: CorpusGame;
  reviewMoves: ClassifiedMoveDto[];
  /** What the checks read, by fen: the engine's `ENGINE_MULTI_PV` lines,
   * wider than the review's own `REVIEW_MULTI_PV`, so a move a card names
   * is found among them. */
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
  // The worker's own calls (services/analysis-chunks.ts `analyzeReviewEvals`, services/analysis.ts).
  const gameEvals = await engine.analyzeGame(fens, { multiPv: REVIEW_MULTI_PV });
  const evals = await widenBrilliantCandidates(parsedGame, gameEvals, (positions) => engine.analyzeGame(positions, { multiPv: ENGINE_MULTI_PV }));
  const passEvals = await scanPasses((positions) => engine.analyzeGame(positions, { multiPv: 1 }), [parsedGame.positions]);
  const steps = await runAnalysisSteps(
    {
      gameId: game.id,
      userId: 'review-audit',
      userColor: game.readerSide,
      userRating: null,
      pgn: game.pgn,
      pgnResult: parsedGame.headers.Result ?? null,
      parsedGame,
      evals,
      passEvals
    },
    createStepTimer()
  );
  // No options: the backends' default is ENGINE_MULTI_PV, and the audit's
  // engine cache already holds these searches under that key.
  const oracleEvals = await engine.analyzeGame(fens);
  const evalsByFen = new Map(oracleEvals.map((evaluation) => [evaluation.fen, evaluation]));
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
