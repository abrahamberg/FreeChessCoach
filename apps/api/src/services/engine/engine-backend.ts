import type { EngineEval, EnginePriority, PositionAnalysis } from '@freechesscoach/shared';
import type { BotMoveDebugCollector } from './bot-move-debug.js';

/**
 * Options for engine backend analysis methods.
 */
export interface EngineBackendAnalyzeOptions {
  depth?: number;
  multiPv?: number;
  /** Wall-clock cap on top of `depth` for a browser-tunnel-fulfilled
   * request — passed straight through to the browser's `go depth D
   * movetime M` (see shared-engine-worker.ts's AnalyzeRequest). Ignored by
   * every backend except BrowserTunnelEngineBackend. Only the lite tunnel
   * supplement sets this (LiteSupplementedEngineBackend) — depth alone
   * assumes the browser tab's host is fast enough to reach it quickly,
   * which measured false on at least one real device (a depth-8, multiPv-6
   * lite search still took ~14s), and a slow device is exactly the case
   * where a live, user-waiting bot move can't afford an open-ended wait. */
  movetimeMs?: number;
  /** 'interactive' for a live, user-waiting call (bot move selection) so it
   * jumps ahead of queued background work on the native engine pool — see
   * EnginePrioritySchema's doc comment. Defaults to 'background'; only
   * NativeEngineBackend acts on it today. */
  priority?: EnginePriority;
  /** Which browser worker fulfills this request when the raw backend is a
   * BrowserTunnelEngineBackend — 'main' (default) is the full-net build
   * used for graded/official evaluation; 'lite' is the lightweight
   * candidate-breadth-supplementation/JIT-hints worker (see
   * LiteSupplementedEngineBackend). Ignored by every other backend. */
  engine?: 'main' | 'lite';
  /** Bot move selection's own debug sink (see bot-move-debug.ts) — undefined
   * for every other caller. LiteSupplementedEngineBackend writes into it
   * when present; every other backend just ignores it. */
  debug?: BotMoveDebugCollector;
}

/**
 * Pluggable interface for engine backends (native HTTP, browser tunnel, caching decorator, etc.).
 * All backends must conform to this interface.
 */
export interface EngineBackend {
  /**
   * Analyze a single chess position.
   *
   * @param fen - The position in FEN notation
   * @param opts - Optional analysis parameters (depth, multiPv)
   * @returns Promise resolving to the analysis of the position
   */
  analyzePosition(fen: string, opts?: EngineBackendAnalyzeOptions): Promise<PositionAnalysis>;

  /**
   * Analyze a game as a batch of positions.
   *
   * @param fens - An array of FEN strings (typically one per ply of the game)
   * @param opts - Optional analysis parameters (depth, multiPv)
   * @returns Promise resolving to an array of engine evaluations
   */
  analyzeGame(fens: string[], opts?: EngineBackendAnalyzeOptions): Promise<EngineEval[]>;
}
