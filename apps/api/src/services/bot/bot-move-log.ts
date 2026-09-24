import { devLog } from '../../lib/dev-log.js';
import type { BotMoveDebugCollector, EngineCallDebugInfo } from '../engine/bot-move-debug.js';

/** This event's own name in the shared dev-log registry (see
 * lib/dev-log.ts) — set DEBUG_LOG=bot_move (or DEBUG_LOG=*) to see one
 * structured object right before each bot move is returned, showing exactly
 * which engine(s) were actually called (and how long each took, and how
 * many lines each gave back), and — on a miss — the TTC candidate pool a
 * blunder/tactical-mistake was drawn from. Deliberately separate from
 * engine-source-usage.ts's `engine-source: ...` line, which exists for a
 * different purpose (per-user analytics aggregated across every engine call
 * in the app, not just bot moves) and stays unchanged. Only emitted after a
 * move is picked — the live view of a move that is still running (or stuck)
 * is the Thinking log (bot-move-trace.ts). */
export const DEBUG_LOG_TYPE = 'bot_move';

export type BotMoveSource = 'book' | 'internal' | 'external' | 'browser' | 'lightBrowser' | 'tactics';

export interface BotMoveLogEntry {
  bot: string;
  elo: number;
  ply: number;
  /** The account's own configured engineMode for this move — null only for
   * a book move, which never reaches the engine. Always shown explicitly so
   * it's never necessary to infer the app setting from which bucket below
   * got populated (a mode's own main call can still come back empty/short,
   * which is a separate thing from what mode was actually configured). */
  engineMode: 'internal' | 'external' | 'browser' | null;
  /** Which source actually produced the played move. */
  selected: BotMoveSource;
  /** Short human description of the %A/%B/%C branch taken. */
  path: string;
  internal: EngineCallDebugInfo | null;
  external: EngineCallDebugInfo | null;
  browser: EngineCallDebugInfo | null;
  lightBrowser: EngineCallDebugInfo | null;
  /** Bot move selection always goes through resolveRawEngineBackend, at its
   * own bot-specific depth/multiPv, never a shared cache — always 'none',
   * shown explicitly rather than omitted so it's clear this isn't a missing
   * measurement. */
  cached: 'none';
  tactics: 'none' | { candidates: { move: string; cp: number | null; mateIn: number | null; tactic: string | null; selected: boolean }[]; time: string };
  picked: string;
  /** The played move's own engine eval (mover-relative — same convention as
   * BotCandidate.cp/mateIn), so it's visible without cross-referencing
   * whichever bucket/tactics-sample entry above happens to contain it. */
  pickedCp: number | null;
  pickedMateIn: number | null;
  totalTime: string;
}

export function logBotMove(entry: BotMoveLogEntry): void {
  devLog(DEBUG_LOG_TYPE, entry);
}

/** Forwards every call through to `random` unchanged (so behavior/tests are
 * unaffected) while recording each raw draw — pickBotMove always draws its
 * three %A/%B/%C rolls unconditionally, in order, before any branching (see
 * its own doc comment), so `rolls[0..2]` here are exactly r1/r2/r3 without
 * pickBotMove needing to know it's being observed. */
export function recordingRandom(random: () => number, rolls: number[]): () => number {
  return () => {
    const value = random();
    rolls.push(value);
    return value;
  };
}

export interface BotBranch {
  isMiss: boolean;
  path: string;
  /** The roll(s) behind the branch, in words — shown in the Thinking log so
   * "why did it play that" doesn't need the raw numbers cross-referenced. */
  reason: string;
}

/** Which bucket of `debug` actually contains `picked`'s SAN — the source
 * that served the played move on a %A-hit (top-five) branch. Checked in
 * main-engine-first order so a duplicate SAN (rare) attributes to the
 * user's own configured engine rather than the lite supplement. */
export function deriveEngineSource(debug: BotMoveDebugCollector, pickedSan: string): BotMoveSource {
  const buckets = ['internal', 'external', 'browser', 'lightBrowser'] as const;
  for (const bucket of buckets) {
    if (debug[bucket]?.moves.some((line) => line.move === pickedSan)) return bucket;
  }
  return buckets.find((bucket) => debug[bucket] !== null) ?? 'internal';
}
