import { annotateCandidateMoves, annotatePvTactics, type BotCandidate } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';

/** Requested from the engine on every bot search, regardless of phase depth
 * — deliberately wide (rather than a narrow per-bot multiPv) so a genuinely
 * bad move (e.g. hanging a queen) can appear in the candidate pool at all.
 * Stockfish clips MultiPV to however many legal root moves actually exist,
 * so requesting more than a position has is harmless. Without this breadth,
 * "short board sight" could only ever reorder engine-approved lines, never
 * produce a real blunder — see docs/plan.md's Phase 60. */
export const BOT_CANDIDATE_BREADTH = 40;

export interface BotCandidatesDependencies {
  /** Uncached, bot-specific engine search (see resolveRawEngineBackend) —
   * runs at the caller's phase-resolved depth, deliberately never the shared
   * position_evaluations cache. */
  analyzeBotPosition: (fen: string, opts: { depth: number; multiPv: number }) => Promise<PositionAnalysis>;
}

/**
 * Builds one bot's full candidate-move list for a position: the engine's own
 * lines at `depth` (the caller's phase-resolved search depth) and a fixed
 * wide breadth (BOT_CANDIDATE_BREADTH), each annotated with its immediate
 * (1-ply) tactical consequences (annotateCandidateMoves) and its multi-ply
 * lookahead (annotatePvTactics) — everything pickBotMove needs.
 */
export async function buildBotCandidates(
  deps: BotCandidatesDependencies,
  fen: string,
  depth: number
): Promise<BotCandidate[]> {
  const analysis = await deps.analyzeBotPosition(fen, { depth, multiPv: BOT_CANDIDATE_BREADTH });
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
      // mover-relative, which is what bot-move-pick.ts's mate-conversion
      // check on the top candidate's mateIn requires ("positive mateIn"
      // must mean "good for whoever is about to move").
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
