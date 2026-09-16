import {
  annotateCandidateMoves,
  annotatePvTactics,
  candidateDiagnosisCodes,
  fenActiveColor,
  motifToCode,
  type BotCandidate
} from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { BotMoveDebugCollector } from '../engine/bot-move-debug.js';

/** Requested from the engine on every bot search — deliberately wide
 * (rather than a narrow per-bot multiPv) so a genuinely bad move (e.g.
 * hanging a queen) can appear in the candidate pool at all. Stockfish clips
 * MultiPV to however many legal root moves actually exist, so requesting
 * more than a position has is harmless. Without this breadth, "short board
 * sight" could only ever reorder engine-approved lines, never produce a
 * real blunder — see docs/plan.md's Phase 60. */
export const BOT_CANDIDATE_BREADTH = 40;

/** Fixed search depth for every bot, every phase, every rating tier — bot
 * weakness no longer comes from shallowing the engine (a bot config can no
 * longer request a weaker search): it comes entirely from
 * pickBotMove's %A/%B/%C decision tree (see
 * docs/plan-bot-engine.md's Phase 64). This also matters structurally: once
 * the only engine actually available to a user is a fixed-depth external
 * one (chess-api.com caps at 18 regardless of what's requested), asking for
 * anything shallower than that stopped being a real lever anyway. */
export const BOT_SEARCH_DEPTH = 18;

/** Wall-clock cap on top of BOT_SEARCH_DEPTH/BOT_CANDIDATE_BREADTH — only
 * BrowserTunnelEngineBackend acts on it (EngineBackendAnalyzeOptions'
 * movetimeMs doc comment), so native/chess_api searches are unaffected.
 * Without it, a user on 'browser' engineMode pays this depth/breadth
 * uncapped: the same depth-18/40-line search measured 24-38s per bot move
 * on a single-threaded WASM build in production (see
 * lite-supplemented-engine-backend.ts's LITE_SUPPLEMENT_MOVETIME_MS doc
 * comment, which caps the narrower lite supplement the same way) — a live
 * "your move" round trip the student is staring at, not background work. */
export const BOT_SEARCH_MOVETIME_MS = 8000;

export interface BotCandidatesDependencies {
  /** Uncached, bot-specific engine search (see resolveRawEngineBackend) —
   * runs at the caller's phase-resolved depth, deliberately never the shared
   * position_evaluations cache. */
  analyzeBotPosition: (
    fen: string,
    opts: { depth: number; multiPv: number; movetimeMs: number; debug?: BotMoveDebugCollector }
  ) => Promise<PositionAnalysis>;
}

/**
 * Builds one bot's full candidate-move list for a position: the engine's own
 * lines at the fixed BOT_SEARCH_DEPTH and a fixed wide breadth
 * (BOT_CANDIDATE_BREADTH), each annotated with its immediate (1-ply)
 * tactical consequences (annotateCandidateMoves) and its multi-ply
 * lookahead (annotatePvTactics) — everything pickBotMove needs. `debug`
 * (bot-move-selector.ts's own per-move debug log) is forwarded straight
 * through to the engine call, which is the only thing that can actually
 * populate it — see bot-move-debug.ts.
 */
export async function buildBotCandidates(
  deps: BotCandidatesDependencies,
  fen: string,
  debug?: BotMoveDebugCollector
): Promise<BotCandidate[]> {
  const analysis = await deps.analyzeBotPosition(fen, {
    depth: BOT_SEARCH_DEPTH,
    multiPv: BOT_CANDIDATE_BREADTH,
    movetimeMs: BOT_SEARCH_MOVETIME_MS,
    debug
  });
  const mover = fenActiveColor(fen);

  const annotations = annotateCandidateMoves(
    fen,
    analysis.lines.map((line) => line.moveSan),
    { mover, linesAtFenBefore: analysis.lines }
  );
  const annotationBySan = new Map(annotations.map((annotation) => [annotation.moveSan, annotation]));

  return analysis.lines.map((line) => {
    const annotation = annotationBySan.get(line.moveSan);
    const pvTactics = annotatePvTactics(fen, line.pvSan);

    // Same replay shape motif-to-code.ts's real per-ply diagnostic
    // detectors use (MotifReplay: {fenBefore, moveSan}) — `fen` here is
    // this candidate's own before-position, `line.moveSan` the move being
    // considered, so fork/pin resolve to the exact piece/kind that embodies
    // them. See docs/plan.md's Phase 61.
    const taCode =
      annotation?.motif != null ? motifToCode(annotation.motif, { fenBefore: fen, moveSan: line.moveSan }) : null;
    // BV-*/MS-* codes, cheaply approximated from the same annotation — see
    // docs/plan.md's Phase 62 and candidate-diagnosis-proxy.ts's doc
    // comment for why this is a proxy, not the canonical tag.
    const proxyCodes = annotation ? candidateDiagnosisCodes(annotation) : [];

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
      createsOpponentHangingPiece: annotation?.createsOpponentHangingPiece ?? false,
      createsUnderDefendedPiece: annotation?.createsUnderDefendedPiece ?? false,
      mobilityDelta: annotation?.mobilityDelta ?? 0,
      forkInPlies: pvTactics.forkInPlies,
      motif: annotation?.motif ?? null,
      diagnosisCodes: taCode ? [taCode, ...proxyCodes] : proxyCodes
    };
  });
}

function negate(value: number | null): number | null {
  return value === null ? null : -value;
}
