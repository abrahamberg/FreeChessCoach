import { pickBotMove, selectBookMove, type BotCandidate } from '@freechesscoach/chess-analysis';
import type { BotConfig } from '@freechesscoach/shared';
import { devLog, isDevLogEnabled } from '../../lib/dev-log.js';
import { formatMs, newBotMoveDebugCollector, type BotMoveDebugCollector, type EngineCallDebugInfo } from '../engine/bot-move-debug.js';
import { buildBotCandidates, type BotCandidatesDependencies } from './bot-candidates.js';

/** This event's own name in the shared dev-log registry (see
 * lib/dev-log.ts) — set DEBUG_LOG=bot_move (or DEBUG_LOG=*) to see one
 * structured object right before each bot move is returned, showing exactly
 * which engine(s) were actually called (and how long each took, and how
 * many lines each gave back), and — on a miss — the TTC candidate pool a
 * blunder/tactical-mistake was drawn from. Deliberately separate from
 * engine-source-usage.ts's `engine-source: ...` line, which exists for a
 * different purpose (per-user analytics aggregated across every engine call
 * in the app, not just bot moves) and stays unchanged. */
const DEBUG_LOG_TYPE = 'bot_move';

type BotMoveSource = 'book' | 'internal' | 'external' | 'browser' | 'lightBrowser' | 'tactics';

interface BotMoveLogEntry {
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
  /** Bot move selection always goes through resolveRawEngineBackend, which
   * deliberately bypasses position_evaluations entirely (see its own doc
   * comment) — always 'none', shown explicitly rather than omitted so it's
   * clear this isn't a missing measurement. */
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

function logBotMove(entry: BotMoveLogEntry): void {
  devLog(DEBUG_LOG_TYPE, entry);
}

/** Forwards every call through to `random` unchanged (so behavior/tests are
 * unaffected) while recording each raw draw — pickBotMove always draws its
 * three %A/%B/%C rolls unconditionally, in order, before any branching (see
 * its own doc comment), so `rolls[0..2]` here are exactly r1/r2/r3 without
 * pickBotMove needing to know it's being observed. */
function recordingRandom(random: () => number, rolls: number[]): () => number {
  return () => {
    const value = random();
    rolls.push(value);
    return value;
  };
}

/** Reconstructs which branch of the %A/%B/%C tree produced `picked`, from
 * the recorded rolls plus this bot's own thresholds — good enough for a dev
 * log without pickBotMove itself needing a debug hook for it (it stays a
 * pure function in packages/chess-analysis). */
function describeBranch(rolls: number[], picked: BotCandidate, candidates: BotCandidate[], bot: BotConfig): { isMiss: boolean; path: string } {
  const [r1, , r3] = rolls;
  if (r1 !== undefined && r1 < bot.topFiveChance) {
    const best = candidates[0];
    return best && picked.moveSan === best.moveSan
      ? { isMiss: false, path: 'top moves — best move' }
      : { isMiss: false, path: 'top moves — alternate' };
  }
  const isBlunder = r3 !== undefined && r3 < bot.blunderGivenMissChance;
  return isBlunder ? { isMiss: true, path: 'tactics pool — blunder' } : { isMiss: true, path: 'tactics pool — tactical mistake' };
}

/** Which bucket of `debug` actually contains `picked`'s SAN — the source
 * that served the played move on a %A-hit (top-five) branch. Checked in
 * main-engine-first order so a duplicate SAN (rare) attributes to the
 * user's own configured engine rather than the lite supplement. */
function deriveEngineSource(debug: BotMoveDebugCollector, picked: BotCandidate): BotMoveSource {
  const buckets = ['internal', 'external', 'browser', 'lightBrowser'] as const;
  for (const bucket of buckets) {
    if (debug[bucket]?.moves.some((line) => line.move === picked.moveSan)) return bucket;
  }
  return buckets.find((bucket) => debug[bucket] !== null) ?? 'internal';
}

export interface BotMoveSelectorDependencies extends BotCandidatesDependencies {
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
}

export interface SelectedBotMove {
  san: string;
  usedBook: boolean;
}

/** A selection-logic bug — the engine call itself succeeded, but what came
 * back or what was chosen from it can't be used. Distinct from a transient
 * engine failure (a network blip, a timeout — see withEngineRetry) so that
 * commitBotTurn/requestBotMove can tell them apart: a real bug here will
 * fail the exact same way on every retry, so silently reporting it as
 * `botPending` (as if the engine were merely down) would leave the game
 * stuck forever behind an indefinite client-side poll instead of surfacing
 * as the visible failure it should be. */
export class BotSelectionError extends Error {}

/** A bot move sits behind the live "your move" round trip (commitBotTurn):
 * a single dropped or timed-out engine call — contention with a background
 * analysis job, a transient network blip — must not strand the game with
 * the player's move committed but no bot reply. Retries the engine call a
 * few times with a short, increasing backoff before giving up; the caller
 * (commitBotTurn) still has its own botPending fallback for when every
 * attempt here fails. */
const ENGINE_RETRY_ATTEMPTS = 3;
const ENGINE_RETRY_DELAY_MS = 500;

async function withEngineRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ENGINE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < ENGINE_RETRY_ATTEMPTS - 1) await sleep(ENGINE_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Picks one move for a bot at `fen`: book first (opening-only, via
 * `bookPlies`/`bookMistakeChance`, breadth-capped by elo — see
 * bot-opening.ts's selectBookMove), then a fixed-depth engine search
 * (bot-candidates.ts's BOT_SEARCH_DEPTH — every bot, every phase, the same
 * depth) feeding `pickBotMove`'s %A/%B/%C decision tree (this bot's own
 * literal `topFiveChance`/`bestMoveGivenTopFiveChance`/
 * `blunderGivenMissChance`, docs/plan-bot-engine.md's Phase 64) between the
 * engine's own top-5 candidates and the TTC-derived tactical-mistake/
 * blunder pool. `plyCount` is halfmoves played so far, before this move.
 */
export async function selectBotMove(
  deps: BotMoveSelectorDependencies,
  fen: string,
  plyCount: number,
  bot: BotConfig
): Promise<SelectedBotMove> {
  const start = Date.now();
  const book = selectBookMove(fen, plyCount, bot, deps.random);
  if (book) {
    logBotMove({
      bot: bot.name,
      elo: bot.elo,
      ply: plyCount,
      engineMode: null,
      selected: 'book',
      path: 'opening book',
      internal: null,
      external: null,
      browser: null,
      lightBrowser: null,
      cached: 'none',
      tactics: 'none',
      picked: book.san,
      pickedCp: null,
      pickedMateIn: null,
      totalTime: formatMs(Date.now() - start)
    });
    return { san: book.san, usedBook: true };
  }

  const debug = newBotMoveDebugCollector();
  const candidates = await withEngineRetry(() => buildBotCandidates(deps, fen, debug));
  if (candidates.length === 0) {
    throw new BotSelectionError(`selectBotMove: engine returned no candidates for a non-terminal position (fen "${fen}")`);
  }

  const rolls: number[] = [];
  const pickStart = Date.now();
  // A plain mutable field (rather than a bare `let`) so TypeScript's control
  // flow narrowing doesn't get confused about a variable only ever
  // reassigned inside a nested closure (onTacticsSample below) — reads of
  // `tacticsDebug.sample` after pickBotMove returns narrow correctly.
  const tacticsDebug: { sample: BotCandidate[] | null; time: string } = { sample: null, time: '' };
  const picked = pickBotMove({
    candidates,
    personality: bot.personality,
    topFiveChance: bot.topFiveChance,
    bestMoveGivenTopFiveChance: bot.bestMoveGivenTopFiveChance,
    mateConversionChance: bot.mateConversionChance,
    blunderGivenMissChance: bot.blunderGivenMissChance,
    diagnosisCodes: bot.diagnosisCodes,
    fenBefore: fen,
    random: recordingRandom(deps.random, rolls),
    onTacticsSample: (sample) => {
      tacticsDebug.sample = sample;
      tacticsDebug.time = formatMs(Date.now() - pickStart);
    }
  });

  if (isDevLogEnabled(DEBUG_LOG_TYPE)) {
    const { isMiss, path } = describeBranch(rolls, picked, candidates, bot);
    logBotMove({
      bot: bot.name,
      elo: bot.elo,
      ply: plyCount,
      engineMode: debug.mode,
      selected: isMiss ? 'tactics' : deriveEngineSource(debug, picked),
      path,
      internal: debug.internal,
      external: debug.external,
      browser: debug.browser,
      lightBrowser: debug.lightBrowser,
      cached: 'none',
      tactics: tacticsDebug.sample
        ? {
            candidates: tacticsDebug.sample.map((candidate) => ({
              move: candidate.moveSan,
              cp: candidate.cp,
              mateIn: candidate.mateIn,
              tactic: candidate.motif,
              selected: candidate.moveSan === picked.moveSan
            })),
            time: tacticsDebug.time
          }
        : 'none',
      picked: picked.moveSan,
      pickedCp: picked.cp,
      pickedMateIn: picked.mateIn,
      totalTime: formatMs(Date.now() - start)
    });
  }

  return { san: picked.moveSan, usedBook: false };
}
