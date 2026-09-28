import {
  buildCourseDossier,
  courseLineGames,
  courseTreeFens,
  temptingCandidates,
  withTempting,
  type CourseDossier,
  type CourseLineAnalysis,
  type CourseTree
} from '@freechesscoach/chess-analysis';
import type { CourseKind, EngineEval } from '@freechesscoach/shared';
import { runAnalysisSteps } from './analysis-steps.js';
import type { EngineBackend } from './engine/engine-backend.js';
import { resolveReviewEngineBackend, type ResolveEngineBackendOptions } from './engine/resolve-engine-backend.js';
import { createStepTimer } from './step-timer.js';

/** docs/courses.md §5.4: three engine lines per position, so a quiz can
 * see how far the best move stands above the next. */
const COURSE_MULTI_PV = 3;

export interface CourseDossierResult {
  dossier: CourseDossier;
  lines: CourseLineAnalysis[];
}

/** Evaluates a tree as `userId`; injected into the course routes so their
 * tests need no engine. `kind` decides where tempting moves are looked for
 * (§13.5). */
export type CourseDossierBuilder = (tree: CourseTree, learnerSide: 'white' | 'black', userId: string, kind?: CourseKind) => Promise<CourseDossierResult>;

/** The app's builder: the same engine pipeline game review uses (Lichess
 * eval index first, then the user's engine setting). */
export function courseDossierBuilderFor(options: ResolveEngineBackendOptions): CourseDossierBuilder {
  return async (tree, learnerSide, userId, kind) => buildCourseDossierFromEngine(tree, learnerSide, await resolveReviewEngineBackend(options, userId), kind ?? null);
}

/**
 * Evaluates every distinct tree position once, in one batch through the
 * engine pipeline (the caller's backend, Lichess eval index first), then
 * runs the whole-game analysis steps on each line as if it were a game.
 * Then a second, smaller batch evaluates the tempting candidates (§13.5):
 * the checks, captures and threats at the moves that matter, kept when the
 * engine says they fail.
 */
export async function buildCourseDossierFromEngine(
  tree: CourseTree,
  learnerSide: 'white' | 'black',
  backend: Pick<EngineBackend, 'analyzeGame'>,
  kind: CourseKind | null = null
): Promise<CourseDossierResult> {
  const fens = courseTreeFens(tree);
  // minLines 2: the index stores one line for most forced positions, and a
  // quiz is judged on the gap to the second move.
  const evals = await backend.analyzeGame(fens, { multiPv: COURSE_MULTI_PV, minLines: 2 });
  const evalsByFen = new Map<string, EngineEval>();
  fens.forEach((fen, index) => {
    const evaluation = evals[index];
    if (evaluation) evalsByFen.set(fen, { ...evaluation, fen });
  });

  const lines: CourseLineAnalysis[] = [];
  for (const line of courseLineGames(tree)) {
    const lineEvals = line.game.positions.map((position, ply) => {
      const evaluation = evalsByFen.get(position.fen);
      if (!evaluation) throw new Error(`No engine eval for course position ${position.fen}`);
      return { ...evaluation, ply };
    });
    const steps = await runAnalysisSteps(
      {
        gameId: `course-${line.lineId}`,
        userId: 'course',
        userColor: learnerSide,
        userRating: null,
        pgn: line.pgn,
        pgnResult: null,
        parsedGame: line.game,
        evals: lineEvals
      },
      createStepTimer()
    );
    lines.push({ line, moves: steps.gameReport.moves, candidateMoments: steps.candidateMoments });
  }
  const dossier = buildCourseDossier({ tree, evalsByFen, lines, learnerSide });
  const candidates = temptingCandidates(tree, dossier, kind);
  const candidateFens = [...new Set(candidates.map((candidate) => candidate.fen))].filter((fen) => !evalsByFen.has(fen));
  if (candidateFens.length) {
    const answers = await backend.analyzeGame(candidateFens, { multiPv: 1, minLines: 1 });
    candidateFens.forEach((fen, index) => {
      const evaluation = answers[index];
      if (evaluation) evalsByFen.set(fen, { ...evaluation, fen });
    });
  }
  return { dossier: withTempting(dossier, candidates, evalsByFen), lines };
}
