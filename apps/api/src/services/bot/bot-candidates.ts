import { annotateCandidateMoves, annotatePvTactics, type BotCandidate } from '@freechesscoach/chess-analysis';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';

export interface BotCandidatesDependencies {
  /** Uncached, bot-specific engine search (see resolveRawEngineBackend) —
   * runs at this bot's own depth/multiPv, deliberately never the shared
   * position_evaluations cache. */
  analyzeBotPosition: (fen: string, opts: { depth: number; multiPv: number }) => Promise<PositionAnalysis>;
}

/**
 * Builds one bot's full candidate-move list for a position: the engine's own
 * lines at this bot's depth/multiPv, each annotated with its immediate (1-ply)
 * tactical consequences (annotateCandidateMoves) and its multi-ply
 * lookahead (annotatePvTactics) — everything scoreBotCandidates needs,
 * available to every bot regardless of the AI toggle (the PV lookahead is
 * math, not an AI feature).
 */
export async function buildBotCandidates(
  deps: BotCandidatesDependencies,
  fen: string,
  bot: BotConfig
): Promise<BotCandidate[]> {
  const analysis = await deps.analyzeBotPosition(fen, { depth: bot.depth, multiPv: bot.multiPv });
  const mover = fenMoverColor(fen);

  const annotations = annotateCandidateMoves(
    fen,
    analysis.lines.map((line) => line.moveSan),
    { mover, linesAtFenBefore: analysis.lines }
  );
  const annotationBySan = new Map(annotations.map((annotation) => [annotation.moveSan, annotation]));

  return analysis.lines.map((line) => {
    const annotation = annotationBySan.get(line.moveSan);
    const pvTactics = annotatePvTactics(fen, line.pvSan);

    return {
      moveSan: line.moveSan,
      // PositionAnalysisLine.cp/mateIn are White-perspective (see
      // packages/chess-analysis/src/assert-eval-sign.ts) — flip to
      // mover-relative, which is what bot-candidate-score.ts's baseScore
      // (reusing win-probability.ts's White-perspective helpers "as if
      // White") requires.
      cp: mover === 'white' ? line.cp : negate(line.cp),
      mateIn: mover === 'white' ? line.mateIn : negate(line.mateIn),
      createsFork: annotation?.createsFork ?? false,
      createsHangingPiece: annotation?.createsHangingPiece ?? false,
      createsUnderDefendedPiece: annotation?.createsUnderDefendedPiece ?? false,
      mobilityDelta: annotation?.mobilityDelta ?? 0,
      forkInPlies: pvTactics.forkInPlies,
      motif: annotation?.motif ?? null
    };
  });
}

function negate(value: number | null): number | null {
  return value === null ? null : -value;
}

function fenMoverColor(fen: string): 'white' | 'black' {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white';
}
