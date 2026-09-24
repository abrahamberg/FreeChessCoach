import {
  annotateCandidateMoves,
  candidateDiagnosisCodes,
  fenActiveColor,
  legalSanMoves,
  motifToCode,
  pvForkInPlies,
  TOP_LINES,
  type BotCandidate
} from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import type { BotMoveDebugCollector } from '../engine/bot-move-debug.js';
import type { BotMoveTrace } from './bot-move-trace.js';

/** Fixed search depth for every bot, every phase, every rating tier — bot
 * weakness no longer comes from shallowing the engine (a bot config can no
 * longer request a weaker search): it comes entirely from
 * the %A/%B/%C decision tree (bot-move-pick.ts; see
 * docs/plan-bot-engine.md's Phase 64). This also matters structurally: once
 * the only engine actually available to a user is a fixed-depth external
 * one (chess-api.com caps at 18 regardless of what's requested), asking for
 * anything shallower than that stopped being a real lever anyway. */
export const BOT_SEARCH_DEPTH = 12;

/** Wall-clock cap on top of BOT_SEARCH_DEPTH and the requested line count — only
 * BrowserTunnelEngineBackend acts on it (EngineBackendAnalyzeOptions'
 * movetimeMs doc comment), so native/chess_api searches are unaffected.
 * Without it, a user on 'browser' engineMode pays this depth
 * uncapped: the same depth-18/40-line search measured 24-38s per bot move
 * on a single-threaded WASM build in production (see
 * lite-supplemented-engine-backend.ts's LITE_SUPPLEMENT_MOVETIME_MS doc
 * comment, which caps the narrower lite supplement the same way) — a live
 * "your move" round trip the student is staring at, not background work. */
export const BOT_SEARCH_MOVETIME_MS = 8000;

export interface BotCandidatesDependencies {
  /** Bot-specific search from the shared engine pipeline. It deliberately
   * runs through resolveRawEngineBackend, skipping the lite-engine breadth
   * supplement, because its requested depth/multiPv differ from official
   * analysis and are never compared against it. */
  analyzeBotPosition: (
    fen: string,
    opts: { depth: number; multiPv: number; movetimeMs: number; debug?: BotMoveDebugCollector }
  ) => Promise<PositionAnalysis>;
}

/** Where this call sits in withEngineRetry's attempts, so the Thinking log
 * can say "attempt 2 of 3" — passed only when a move is being traced. */
export interface BotCandidatesTraceContext {
  trace: BotMoveTrace;
  attempt: number;
  attempts: number;
}

/**
 * Builds one bot's candidate-move list for a position: the engine's own
 * lines at the fixed BOT_SEARCH_DEPTH and a breadth sized to the branch
 * (the lines the branch needs), each carrying its immediate (1-ply) tactical
 * consequences (annotateCandidateMoves) and its multi-ply lookahead
 * (pvForkInPlies) — everything pickBotMove needs — computed on demand
 * (see toBotCandidates). `debug` (bot-move-selector.ts's own per-move debug
 * log) is forwarded straight through to the engine call, which is the only
 * thing that can actually populate it — see bot-move-debug.ts.
 * `traceContext`, when present, times the engine search as a Thinking-log
 * step.
 */
export async function buildBotCandidates(
  deps: BotCandidatesDependencies,
  fen: string,
  debug?: BotMoveDebugCollector,
  traceContext?: BotCandidatesTraceContext,
  lines: number = TOP_LINES
): Promise<BotCandidate[]> {
  return (await searchBotCandidates(deps, fen, debug, traceContext, lines)).candidates;
}

/** The candidates plus the engine analysis they were built from — the turn
 * keeps the analysis to rate the moves (bot-move-grading.ts) without another
 * engine call. */
export interface BotSearchResult {
  candidates: BotCandidate[];
  analysis: PositionAnalysis;
}

export async function searchBotCandidates(
  deps: BotCandidatesDependencies,
  fen: string,
  debug?: BotMoveDebugCollector,
  traceContext?: BotCandidatesTraceContext,
  lines: number = TOP_LINES
): Promise<BotSearchResult> {
  const analysis = await searchEngine(deps, fen, lines, debug, traceContext);
  return { analysis, candidates: toBotCandidates(fen, analysis) };
}

function searchEngine(
  deps: BotCandidatesDependencies,
  fen: string,
  lines: number,
  debug: BotMoveDebugCollector | undefined,
  traceContext: BotCandidatesTraceContext | undefined
): Promise<PositionAnalysis> {
  const search = () =>
    deps.analyzeBotPosition(fen, {
      depth: BOT_SEARCH_DEPTH,
      multiPv: lines,
      movetimeMs: BOT_SEARCH_MOVETIME_MS,
      debug
    });
  if (!traceContext) return search();

  const { trace, attempt, attempts } = traceContext;
  return trace.run(`Engine search (attempt ${attempt} of ${attempts})`, search, {
    detail: `asking for depth ${BOT_SEARCH_DEPTH}, ${lines} ${lines === 1 ? 'line' : 'lines'}`,
    describeResult: (analysis) =>
      `${analysis.lines.length} ${analysis.lines.length === 1 ? 'line' : 'lines'} returned (asked for depth ${BOT_SEARCH_DEPTH}, ${lines})`
  });
}

/** The candidate fields that need annotation work (a position replay, motif
 * classification, a PV walk) — everything except the move and its score. */
type AnnotationFields = Omit<BotCandidate, 'moveSan' | 'cp' | 'mateIn'>;
const ANNOTATION_KEYS = [
  'createsFork',
  'createsOpponentHangingPiece',
  'createsUnderDefendedPiece',
  'mobilityDelta',
  'forkInPlies',
  'motif',
  'diagnosisCodes'
] as const satisfies readonly (keyof AnnotationFields)[];

/**
 * One candidate per engine line, its annotation fields computed ON DEMAND:
 * annotating a candidate cost roughly 0.3 s (about 0.05 s once the PV walk skips tactic classification) of synchronous CPU (it
 * blocks the API's event loop), and pickBotMove only ever reads them for the
 * few moves it actually weighs — none at all when the engine's best move is
 * played, about four for an alternate top move, at most ten for a mistake
 * (bot-mistake-pool.ts ranks its pool from the position alone, then weighs
 * only that pool). Annotating all 33-40 lines up front, as this used to,
 * spent most of a turn on moves nobody looked at.
 *
 * The fields are memoised getters, so a candidate still reads, spreads and
 * logs exactly like the plain object it replaces; only WHEN the work happens
 * changes (it now lands inside "Choosing move" in the Thinking log).
 */
function toBotCandidates(fen: string, analysis: PositionAnalysis): BotCandidate[] {
  const mover = fenActiveColor(fen);

  return analysis.lines.map((line) => {
    const candidate = {
      moveSan: line.moveSan,
      // PositionAnalysisLine.cp/mateIn are White-perspective (see
      // packages/chess-analysis/src/assert-eval-sign.ts) — flip to
      // mover-relative, which is what bot-move-pick.ts's mate-conversion
      // check on the top candidate's mateIn requires ("positive mateIn"
      // must mean "good for whoever is about to move").
      cp: mover === 'white' ? line.cp : negate(line.cp),
      mateIn: mover === 'white' ? line.mateIn : negate(line.mateIn)
    } as BotCandidate;

    return withLazyAnnotation(candidate, () => annotateCandidate(fen, mover, line.moveSan, line.pvSan, analysis.lines));
  });
}

/** Every legal move as a candidate, with no engine score (`cp`/`mateIn` null):
 * the pool a bot screens for a mistake to try (bot-mistake-pool.ts) before it
 * asks the engine anything about any of them. Annotated on demand like the
 * engine's own lines, with a one-ply look-ahead — there is no principal
 * variation to walk. */
export function legalMoveCandidates(fen: string): BotCandidate[] {
  const mover = fenActiveColor(fen);
  return legalSanMoves(fen).map((san) => {
    const candidate = { moveSan: san, cp: null, mateIn: null } as BotCandidate;
    return withLazyAnnotation(candidate, () => annotateCandidate(fen, mover, san, [san], undefined));
  });
}

function withLazyAnnotation(candidate: BotCandidate, compute: () => AnnotationFields): BotCandidate {
  let annotated: AnnotationFields | undefined;
  const annotation = () => (annotated ??= compute());
  for (const key of ANNOTATION_KEYS) {
    Object.defineProperty(candidate, key, { enumerable: true, get: () => annotation()[key] });
  }
  return candidate;
}

function annotateCandidate(
  fen: string,
  mover: 'white' | 'black',
  moveSan: string,
  pvSan: string[],
  linesAtFenBefore: PositionAnalysis['lines'] | undefined
): AnnotationFields {
  const [annotation] = annotateCandidateMoves(fen, [moveSan], { mover, linesAtFenBefore });

  // Same replay shape motif-to-code.ts's real per-ply diagnostic
  // detectors use (MotifReplay: {fenBefore, moveSan}) — `fen` here is
  // this candidate's own before-position, `line.moveSan` the move being
  // considered, so fork/pin resolve to the exact piece/kind that embodies
  // them. See docs/plan.md's Phase 61.
  const taCode = annotation?.motif != null ? motifToCode(annotation.motif, { fenBefore: fen, moveSan }) : null;
  // BV-*/MS-* codes, cheaply approximated from the same annotation — see
  // docs/plan.md's Phase 62 and candidate-diagnosis-proxy.ts's doc
  // comment for why this is a proxy, not the canonical tag.
  const proxyCodes = annotation ? candidateDiagnosisCodes(annotation) : [];

  return {
    createsFork: annotation?.createsFork ?? false,
    createsOpponentHangingPiece: annotation?.createsOpponentHangingPiece ?? false,
    createsUnderDefendedPiece: annotation?.createsUnderDefendedPiece ?? false,
    mobilityDelta: annotation?.mobilityDelta ?? 0,
    // Only the fork distance is read from the PV — pvForkInPlies skips the
    // per-ply tactic classification annotatePvTactics does (5× the cost).
    forkInPlies: pvForkInPlies(fen, pvSan),
    motif: annotation?.motif ?? null,
    diagnosisCodes: taCode ? [taCode, ...proxyCodes] : proxyCodes
  };
}

function negate(value: number | null): number | null {
  return value === null ? null : -value;
}
