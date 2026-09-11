import {
  buildPlyDiagnosticContext,
  classifyLiveMove,
  DIAGNOSTIC_DETECTORS,
  type ClassifiedMove
} from '@freechesscoach/chess-analysis';
import type { DiagnosisCodeId, EngineEval, PositionAnalysis } from '@freechesscoach/shared';

/** `classifyPlayMove`'s result: a `ClassifiedMove` widened with the one
 * field `ClassifiedMoveSchema` doesn't carry (see
 * `annotated-pgn.ts`'s `AnnotatedMoveData`'s own doc comment) — the caller
 * (`services/play-moves.ts`) folds this straight into that move's
 * `[%fcc ...]` annotation via `toAnnotatedMoveData`. */
export interface ClassifiedLiveMove extends ClassifiedMove {
  diagnosisCodes: DiagnosisCodeId[];
}

export interface ClassifyPlayMoveArgs {
  ply: number;
  moveSan: string;
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  userColor: 'white' | 'black';
  /** Also run the real diagnostics registry (families BV, MS, TA —
   * diagnostics/registry.ts) against this move and persist whatever it
   * actually failed at — docs/plan.md Phase 62 Task 62.4's canonical tag
   * for a bot's own move, as opposed to bot-move-pick.ts's cheap
   * per-candidate proxy used to steer selection. Defaults to false: real
   * players already have a fuller, cross-ply-aware diagnosis pipeline (the
   * batch job, Phase 53+), and this single-ply live path would only ever
   * see a strictly weaker signal for them, so only the bot path opts in
   * (bot-move-commit.ts via play-moves.ts's commitBotMove). */
  computeDiagnosisCodes?: boolean;
}

/**
 * Play mode's live equivalent of the batch pipeline's classifyMoves: two
 * engine calls (before/after the move, via the cache-first `analyzePosition`
 * dependency) feed the exact same classification code path the batch
 * pipeline uses (classifyLiveMove delegates to classify.ts's private
 * classifyMove). Synchronous, not enqueued — the feedback is needed in the
 * very next coach turn. Purely a classifier now (0032_annotated_pgn.ts) —
 * the caller (`services/play-moves.ts`) is the one that persists the result,
 * by folding it into the game's `annotatedPgn`.
 */
export async function classifyPlayMove(
  analyzePosition: (fen: string) => Promise<PositionAnalysis>,
  args: ClassifyPlayMoveArgs
): Promise<ClassifiedLiveMove> {
  const [analysisBefore, analysisAfter] = await Promise.all([
    analyzePosition(args.fenBefore),
    analyzePosition(args.fenAfter)
  ]);

  const classified = classifyLiveMove({
    ply: args.ply,
    moveSan: args.moveSan,
    mover: args.mover,
    fenBefore: args.fenBefore,
    evalBefore: toEngineEval(args.fenBefore, analysisBefore),
    evalAfter: toEngineEval(args.fenAfter, analysisAfter),
    userColor: args.userColor
  });

  return { ...classified, diagnosisCodes: args.computeDiagnosisCodes ? diagnosisCodesFor(classified) : [] };
}

/**
 * Runs the full diagnostics registry against one already-classified move.
 * Only `failed: true` observations count — a detector reporting an
 * opportunity the move actually handled (`failed: false`) is the opposite
 * of a weakness manifesting. Three detectors (`BV-10`, `MS-07`, `MS-14`)
 * read `ctx.previousMove`/`ctx.nextMoves` for a cross-ply check; both are
 * always undefined here (this is one live move, no surrounding game
 * context), and all three already treat that as "cannot determine, don't
 * fire" rather than throwing, so they simply never contribute a code in
 * this call path.
 */
function diagnosisCodesFor(classified: ClassifiedMove): DiagnosisCodeId[] {
  const context = buildPlyDiagnosticContext(classified);
  if (!context) return [];
  return DIAGNOSTIC_DETECTORS.map((detector) => detector.detect(context))
    .filter((observation): observation is NonNullable<typeof observation> => observation !== null && observation.failed)
    .map((observation) => observation.code);
}

/** classifyLiveMove only reads `.lines` off the eval it's given — `ply` is
 * set to 0 since nothing downstream reads it here. */
function toEngineEval(fen: string, analysis: PositionAnalysis): EngineEval {
  return {
    ply: 0,
    fen,
    depth: analysis.depth,
    lines: analysis.lines.map((line) => ({
      moveUci: line.moveUci,
      moveSan: line.moveSan,
      cp: line.cp,
      mateIn: line.mateIn
    }))
  };
}
