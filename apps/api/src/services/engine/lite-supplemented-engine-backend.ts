import { computePositionFeatures, fenActiveColor, isTacticalPosition } from '@freechesscoach/chess-analysis';
import { ENGINE_MULTI_PV } from '../engine-client.js';
import { formatMs, type EngineLineDebugInfo } from './bot-move-debug.js';
import { BrowserTunnelEngineBackend } from './browser-tunnel-engine-backend.js';
import type { EngineBackend, EngineBackendAnalyzeOptions } from './engine-backend.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import type { EngineEval, PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';

export interface LiteSupplementedEngineBackendOptions {
  /** Passed straight through to the internal BrowserTunnelEngineBackend —
   * same per-position/per-batch tunnel budget every other tunnel caller
   * uses. */
  timeoutMs: number;
  /** Which BotMoveDebugCollector bucket `main`'s own call should be recorded
   * under — resolveRawEngineBackend already knows the user's engineMode, so
   * it picks this once at construction time rather than this class needing
   * to know about engineMode itself. */
  mainBucket: 'internal' | 'external' | 'browser';
}

/** The lite tunnel request always asks for this depth/multiPv, regardless
 * of what the caller requested from `main` — deliberately NOT `opts.depth`/
 * `opts.multiPv` (the bot asks main for depth 18 / 40 lines,
 * BOT_SEARCH_DEPTH/BOT_CANDIDATE_BREADTH in bot-candidates.ts). A depth-18,
 * 40-line multiPv search on a single-threaded WASM build in someone's
 * browser tab measured 24-38s per bot move in production — right at (and
 * often past) the tunnel's own 40s timeout budget (BrowserTunnelEngineBackend's
 * `timeoutMs + ENGINE_TUNNEL_PER_POSITION_MS`), which is sized for the app's
 * normal multiPv-1-to-5 traffic, not a 40-line search. Lite's own
 * contribution is only ever used to widen the bot's TTC-based mistake/
 * blunder pool (bot-mistake-pool.ts's cpLossFromBest, thresholded at 80cp/
 * 250cp) — coarse enough that a shallow search's eval is just as usable as
 * a deep one for "is this move clearly bad," and lite's own top move is
 * never trusted as *the* best move regardless (see mergeLines below, and
 * resolveRawEngineBackend's doc comment: main's own line 1 always wins).
 * Confirmed with the user after production logs showed the timeouts.
 *
 * Depth 8 / 6 lines alone still isn't a hard bound: on a slow device it
 * still measured ~14-15s consistently (not close to the ~24-38s depth-18/
 * 40-line numbers above, but not fast either, and not something a lower
 * depth number can be trusted to fix — it's evidence the browser's own host
 * is just slow, which depth can't account for). LITE_SUPPLEMENT_MOVETIME_MS
 * sends `go depth 8 movetime 3000` (see shared-engine-worker.ts's
 * AnalyzeRequest.movetimeMs) — Stockfish stops at whichever limit comes
 * first, so this is a genuine worst-case ceiling regardless of how slow that
 * particular tab's host turns out to be, not another guess at a "safe"
 * depth. */
const LITE_SUPPLEMENT_DEPTH = 8;
const LITE_SUPPLEMENT_MULTI_PV = 6;
const LITE_SUPPLEMENT_MOVETIME_MS = 3000;

/**
 * How many lite requests one instance of this decorator will ever make.
 *
 * `docs/tactics-rework.md` §7 asks for breadth to be budgeted by ply rather
 * than spent uniformly: only positions the classifier already calls sharp
 * need more lines, which is typically 15-25% of a game. This is the hard cap
 * on top of that filter — at `LITE_SUPPLEMENT_MOVETIME_MS` apiece it bounds
 * a review at about a minute of someone's browser tab, which is affordable
 * for a background job and would not be for a request.
 *
 * The budget belongs to the *instance*, not to `analyzeGame`: a review job
 * also makes single-position calls (the gated tactic-prevention probes in
 * `tactic-prevention.ts`), and those go through the same tunnel. Counting
 * only the batch would leave the documented ceiling to be quietly overrun
 * one probe at a time. `analyzeGame` runs first and so has first call on it,
 * which is the right order — widening the plies the whole report is built
 * from matters more than widening a fallback probe.
 *
 * Every other caller resolves its own backend per request (see
 * `resolveRawEngineBackend`), so a live bot move or hint always starts with
 * the full budget and never notices this.
 */
const LITE_SUPPLEMENT_MAX_REQUESTS = 24;

/**
 * Decorator wrapping whichever raw backend `resolveRawBackendForUser`
 * already resolved (native / chess_api / browser-tunnel-heavy) — never a
 * mode of its own. Calls `main` first; only when `main`'s own result came
 * back with fewer alternatives than both requested *and* the position
 * actually has to offer does it reach for the lightweight browser worker
 * (`engine: 'lite'`) to fill the shortfall. This is what makes the lite
 * engine "compulsory to consult, optional to contribute": every mode gets
 * the same shortfall check, but a mode that already gives enough lines
 * (native, or a position with few legal moves) never touches the tunnel at
 * all.
 *
 * Never caches, and must never be wrapped *by* CachingEngineBackend: the
 * lite engine's results are explicitly not the trusted, official evaluation
 * `position_evaluations` exists to serve. Sitting *outside* one is fine and
 * is how game review uses it (`resolveReviewEngineBackend`) — the cache
 * still only ever sees `main`'s own lines, and the widened ones live for the
 * length of the job that asked for them.
 */
export class LiteSupplementedEngineBackend implements EngineBackend {
  private readonly lite: BrowserTunnelEngineBackend;
  private readonly mainBucket: 'internal' | 'external' | 'browser';
  /** Counts down across every call this instance serves — see
   * `LITE_SUPPLEMENT_MAX_REQUESTS`. */
  private remainingLiteRequests = LITE_SUPPLEMENT_MAX_REQUESTS;

  constructor(
    private readonly main: EngineBackend,
    transport: EngineTunnelTransport,
    userId: string,
    options: LiteSupplementedEngineBackendOptions
  ) {
    this.lite = new BrowserTunnelEngineBackend(transport, userId, options.timeoutMs);
    this.mainBucket = options.mainBucket;
  }

  async analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis> {
    // The debug collector's own `mode` field uses the same
    // internal/external/browser vocabulary as `mainBucket` — see its doc
    // comment in bot-move-debug.ts.
    if (opts?.debug) opts.debug.mode = this.mainBucket;

    const mainStart = Date.now();
    const mainResult = await this.main.analyzePosition(fen, opts);
    if (opts?.debug) {
      opts.debug[this.mainBucket] = { moves: toLineDebug(mainResult.lines), time: formatMs(Date.now() - mainStart) };
    }
    if (!needsSupplement(fen, mainResult.lines.length, opts?.multiPv)) return mainResult;

    const liteStart = Date.now();
    const { lines: liteLines, error: liteError } = await this.tryLiteLines(fen, opts);
    if (opts?.debug) {
      opts.debug.lightBrowser = {
        moves: toLineDebug(liteLines),
        time: formatMs(Date.now() - liteStart),
        ...(liteError ? { error: liteError } : {})
      };
    }
    if (liteLines.length === 0) return mainResult;

    const lines = mergeLines(mainResult.lines, liteLines);
    return { ...mainResult, lines, multiPv: lines.length };
  }

  /**
   * The same shortfall filling, over a whole game, spent only where breadth
   * changes an answer.
   *
   * Game review goes through `analyzeGame`, and this used to delegate
   * straight to `main` — so review never touched the lite worker at all, and
   * every claim was verified against whatever handful of lines chess-api.com
   * or the Lichess index happened to return (`docs/tactics-rework.md` §7).
   *
   * Two things keep it affordable. Positions are filtered to the ones the
   * classifier already calls sharp — a quiet position with three lines is
   * not short of anything worth having — and the survivors draw on the
   * instance's shared `LITE_SUPPLEMENT_MAX_REQUESTS` budget. Requests go one
   * at a time because there is one browser tab on the other end of the
   * tunnel, and a failure anywhere leaves `main`'s own result exactly as it
   * was: this decorator only ever tries to do better.
   */
  async analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]> {
    const mainResults = await this.main.analyzeGame(fens, opts);
    const widened = [...mainResults];

    for (const index of positionsWorthWidening(mainResults, opts)) {
      const { lines: liteLines } = await this.tryLiteLines(mainResults[index]!.fen, opts);
      if (liteLines.length === 0) continue;
      widened[index] = { ...mainResults[index]!, lines: mergeLines(mainResults[index]!.lines, liteLines) };
    }
    return widened;
  }

  private async tryLiteLines(
    fen: string,
    opts?: EngineBackendAnalyzeOptions
  ): Promise<{ lines: PositionAnalysisLine[]; error?: string }> {
    if (this.remainingLiteRequests <= 0) return { lines: [], error: 'lite supplement budget spent' };
    this.remainingLiteRequests -= 1;

    try {
      const liteResult = await this.lite.analyzePosition(fen, {
        ...opts,
        depth: LITE_SUPPLEMENT_DEPTH,
        multiPv: LITE_SUPPLEMENT_MULTI_PV,
        movetimeMs: LITE_SUPPLEMENT_MOVETIME_MS,
        engine: 'lite'
      });
      return { lines: liteResult.lines };
    } catch (error) {
      // No tunnel connected, or the lite request itself failed — this
      // decorator only ever tries to do better than `main`, it never turns
      // a working `main` result into a failure. The error message is kept
      // only for the debug log (see bot-move-debug.ts's EngineCallDebugInfo)
      // so a genuinely-empty lite result isn't confused with "nothing was
      // even listening" — most commonly no browser tab has the engine
      // tunnel connected at all.
      return { lines: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Which plies of a game are worth spending browser time on: the ones that
 * are short of lines *and* sharp enough for the extra lines to change an
 * answer.
 *
 * Sharpness is `tactics-score.ts`'s own `isTacticalPosition` — the same
 * signal the report already computes per ply — so breadth lands exactly
 * where the claim verifier needs it and nowhere else. Ties are broken by
 * how short the position is, so a ply with one line is widened before a ply
 * with four.
 */
function positionsWorthWidening(evals: EngineEval[], opts?: EngineBackendAnalyzeOptions): number[] {
  return evals
    .map((evaluation, index) => ({ index, evaluation }))
    .filter(({ evaluation }) => needsSupplement(evaluation.fen, evaluation.lines.length, opts?.multiPv))
    .filter(({ evaluation }) => isSharp(evaluation))
    .sort((left, right) => left.evaluation.lines.length - right.evaluation.lines.length)
    .slice(0, LITE_SUPPLEMENT_MAX_REQUESTS)
    .map(({ index }) => index)
    .sort((left, right) => left - right);
}

function isSharp(evaluation: EngineEval): boolean {
  try {
    return isTacticalPosition({
      mover: fenActiveColor(evaluation.fen),
      fenBefore: evaluation.fen,
      evalBefore: evaluation,
      features: computePositionFeatures(evaluation.fen)
    });
  } catch {
    // An unreadable FEN is not a reason to fail a whole game's analysis —
    // it just isn't a position worth spending the tunnel on.
    return false;
  }
}

/** Carries each line's own eval into the dev log alongside its SAN — see
 * EngineLineDebugInfo's doc comment (bot-move-debug.ts). */
function toLineDebug(lines: PositionAnalysisLine[]): EngineLineDebugInfo[] {
  return lines.map((line) => ({ move: line.moveSan, cp: line.cp, mateIn: line.mateIn }));
}

/** Whether `main`'s own line count fell short of both what was requested
 * and what the position actually has available — a narrow position (few
 * legal moves) naturally returning fewer lines than `multiPv` requested is
 * not a shortfall worth a tunnel round trip for. */
function needsSupplement(fen: string, mainLineCount: number, requestedMultiPv: number | undefined): boolean {
  const requested = requestedMultiPv ?? ENGINE_MULTI_PV;
  const available = computePositionFeatures(fen).availableMoves.length;
  const target = Math.min(requested, available);
  return mainLineCount < target;
}

/** Keeps `main`'s own line 1 always — it's the trusted judgment for "is
 * this the best move," never second-guessed by the lite engine. If lite's
 * own top move agrees, all of its (at most LITE_SUPPLEMENT_MULTI_PV) lines
 * are pure filler past whatever `main` already had. If it disagrees, all of
 * lite's *other* lines (not its own top move) are spliced in instead —
 * lite's own #1 isn't trusted as *the* best move here, only as one more
 * plausible alternative. Nothing here re-truncates lite's contribution —
 * the cap already happened at the request itself (LITE_SUPPLEMENT_MULTI_PV
 * above), so every line lite actually returned is worth keeping; there's no
 * native fallback left to fall back on if the merged total still comes up
 * short (see resolveRawEngineBackend's doc comment). */
function mergeLines<Main extends { moveSan: string }, Lite extends Main>(mainLines: Main[], liteLines: Lite[]): Main[] {
  const seen = new Set(mainLines.map((line) => line.moveSan));
  const liteTopDiffers = liteLines.length > 0 && liteLines[0]?.moveSan !== mainLines[0]?.moveSan;
  const liteContribution = liteTopDiffers ? liteLines.slice(1) : liteLines;

  const merged: Main[] = [...mainLines];
  for (const line of liteContribution) {
    if (seen.has(line.moveSan)) continue;
    seen.add(line.moveSan);
    merged.push(line);
  }
  return merged;
}
