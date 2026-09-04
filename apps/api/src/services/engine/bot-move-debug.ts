/**
 * Per-bot-move debug data collector — one instance per selectBotMove call,
 * threaded through EngineBackendAnalyzeOptions.debug so
 * LiteSupplementedEngineBackend can record which engine calls it actually
 * made (how long each took, and each returned line's own eval) without it
 * knowing anything about bot move selection itself. bot-move-selector.ts
 * reads the populated collector back out once the move is picked and logs
 * one structured object from it (see BOT_MOVE_DEBUG in bot-move-selector.ts)
 * — this file only defines the shared shape and formatting, it never logs
 * anything itself.
 */

/** One line of a raw engine call's own result — SAN plus the eval that came
 * with it (mover-relative, same convention as BotCandidate.cp/mateIn: see
 * bot-candidates.ts). Carried through to the dev log so a reader can see
 * *why* a candidate looked worth playing (or not) without cross-referencing
 * the tactics sample below for it — and so the same numbers that already
 * drive pickBotMove/bot-mistake-pool.ts's own scoring are visible, not just
 * inferred. */
export interface EngineLineDebugInfo {
  move: string;
  cp: number | null;
  mateIn: number | null;
}

export interface EngineCallDebugInfo {
  /** Every line that call actually returned, in the order returned — raw,
   * before any merge/dedup with another source. */
  moves: EngineLineDebugInfo[];
  time: string;
  /** Set when this call failed or was skipped rather than genuinely
   * returning zero lines — e.g. the lite tunnel had no browser tab
   * connected at all. Distinguishes "nothing to report" from "this
   * legitimately came back empty." */
  error?: string;
}

export interface BotMoveDebugCollector {
  /** The account's own configured engineMode for this move, in the same
   * internal/external/browser vocabulary as the buckets below (not the DB's
   * own 'native'/'chess_api'/'browser' enum spelling — see
   * resolveRawEngineBackend's `mainBucket` computation in
   * resolve-engine-backend.ts) — so the log is always explicit about what
   * setting was actually in effect rather than making the reader infer it
   * from which bucket got populated. Null only for a book move, which never
   * reaches the engine at all. */
  mode: 'internal' | 'external' | 'browser' | null;
  /** Only ever populated when `mode` is 'internal' (engineMode 'native') —
   * a non-native mode that falls short of the requested breadth stays
   * short rather than silently reaching for the server's own native engine;
   * see resolveRawEngineBackend's doc comment for why. */
  internal: EngineCallDebugInfo | null;
  /** chess-api.com (engineMode 'chess_api'). */
  external: EngineCallDebugInfo | null;
  /** The full-net browser-tunnel engine (engineMode 'browser'). */
  browser: EngineCallDebugInfo | null;
  /** The lightweight browser-tunnel supplement (see
   * LiteSupplementedEngineBackend) — populated only when the main call's own
   * result came back short, regardless of whether a tunnel was actually
   * connected to answer it (see EngineCallDebugInfo.error). */
  lightBrowser: EngineCallDebugInfo | null;
}

export function newBotMoveDebugCollector(): BotMoveDebugCollector {
  return { mode: null, internal: null, external: null, browser: null, lightBrowser: null };
}

/** Clamped at 0 — real wall-clock time never goes backward, but a test
 * using fake timers (bot-move-selector.test.ts's retry tests) can reset the
 * clock's epoch mid-measurement, which would otherwise print a nonsensical
 * negative duration. */
export function formatMs(ms: number): string {
  return `${Math.max(0, ms).toFixed(1)}ms`;
}
