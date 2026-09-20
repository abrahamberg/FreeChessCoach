import {
  createMistakeBatcher,
  decideBotBranch,
  drawBotRolls,
  linesNeeded,
  pickAnotherTopFive,
  playsBestMove,
  positionState,
  selectBookMove,
  type BotBranchDecision,
  type BotCandidate,
  type EvalScore,
  type LastMove
} from '@freechesscoach/chess-analysis';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { isDevLogEnabled } from '../../lib/dev-log.js';
import { formatMs, newBotMoveDebugCollector } from '../engine/bot-move-debug.js';
import { BOT_SEARCH_DEPTH, legalMoveCandidates, searchBotCandidates, type BotCandidatesDependencies, type BotSearchResult } from './bot-candidates.js';
import {
  DEBUG_LOG_TYPE,
  deriveEngineSource,
  logBotMove,
  recordingRandom,
  type BotBranch
} from './bot-move-log.js';
import { closestToAMistake, searchForMistake, type VerifiedMove } from './bot-mistake-search.js';
import type { BotMoveTrace } from './bot-move-trace.js';

export interface BotMoveSelectorDependencies extends BotCandidatesDependencies {
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
  /** Evaluates the position AFTER a mistake the bot is thinking of playing, to
   * check it really is one. Shallow is enough — "is this clearly bad" is a
   * coarse question. Omitted, the bot's own engine is asked with a small
   * search (`BOT_VERIFY_DEPTH`). */
  verifyBotPosition?: (fen: string) => Promise<PositionAnalysis>;
  /** The opening-book decision (`selectBookMove`); a seam so a test can play the
   * engine path from the first move, which the book would otherwise take over. */
  selectBook?: typeof selectBookMove;
}

/** The fallback verification search when no dedicated verifier is wired. */
const BOT_VERIFY_DEPTH = 12;
const BOT_VERIFY_MOVETIME_MS = 1500;

export interface SelectedBotMove {
  san: string;
  usedBook: boolean;
  /** The engine analysis of the position this move was chosen in — null for a
   * book move, which searched nothing. Kept so the turn can rate the moves
   * from it instead of asking the engine again (bot-move-grading.ts). */
  analysis: PositionAnalysis | null;
  /** The engine's score of the position this move leaves, White-perspective —
   * saved with the move and used to rate it. Null for a book move. */
  evalAfter: EvalScore | null;
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

async function withEngineRetry<T>(fn: (attempt: number) => Promise<T>, trace?: BotMoveTrace): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ENGINE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < ENGINE_RETRY_ATTEMPTS) await waitBeforeRetry(attempt, trace);
    }
  }
  throw lastError;
}

function waitBeforeRetry(failedAttempt: number, trace: BotMoveTrace | undefined): Promise<void> {
  const delayMs = ENGINE_RETRY_DELAY_MS * failedAttempt;
  if (!trace) return sleep(delayMs);
  return trace.run('Waiting before retry', () => sleep(delayMs), { detail: `${delayMs}ms backoff` });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Picks one move for a bot at `fen`: book first (opening-only, via
 * `bookPlies`/`bookMistakeChance`, breadth-capped by elo — see
 * bot-opening.ts's selectBookMove), then the %A/%B/%C tree
 * (bot-move-pick.ts) decided from the rolls BEFORE the engine is asked, so the
 * one search per move is sized to the branch:
 *
 * - top moves: five lines; the best move, or another of the five;
 * - a miss: one line (the baseline). The mistake is chosen without the engine
 *   (bot-mistake-pool.ts screens plausible moves near what the student just
 *   played) and then checked with the engine, one candidate at a time, until
 *   one really is bad enough (bot-mistake-search.ts) — or none is, and the bot
 *   plays the closest thing it found. A decided position changes the rules:
 *   far behind, no mistakes; far ahead, only a blunder-sized one.
 *
 * Whichever way the move is chosen, the engine's score of the position it
 * leaves is returned with it (`evalAfter`). `plyCount` is halfmoves played so
 * far, before this move; `lastMove` is the student's move that led here.
 */
export async function selectBotMove(
  deps: BotMoveSelectorDependencies,
  fen: string,
  plyCount: number,
  bot: BotConfig,
  trace?: BotMoveTrace,
  lastMove: LastMove | null = null
): Promise<SelectedBotMove> {
  const start = Date.now();
  const book = lookUpBookMove(deps, fen, plyCount, bot, trace);
  if (book) {
    trace?.setResult({ path: 'opening book', picked: book.san });
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
    return { san: book.san, usedBook: true, analysis: null, evalAfter: null };
  }

  const rolls: number[] = [];
  const decision = decideBotBranch(drawBotRolls(recordingRandom(deps.random, rolls)), bot);
  const debug = newBotMoveDebugCollector(trace ?? null);
  const { candidates, analysis } = await searchCandidates(deps, fen, linesNeeded(decision), debug, trace);
  const best = candidates[0];
  if (!best) {
    throw new BotSelectionError(`selectBotMove: engine returned no candidates for a non-terminal position (fen "${fen}")`);
  }

  const pickStart = Date.now();
  const choosingStep = trace?.begin('Choosing move', decision.kind === 'top' ? 'from the engine\'s top lines' : 'looking for a mistake to play');
  const choice = await choose({ deps, fen, bot, decision, rolls, candidates, analysis, best, lastMove, trace });
  if (trace && choosingStep !== undefined) {
    trace.end(choosingStep, { detail: `${choice.branch.path} — ${choice.branch.reason}; engine's best was ${best.moveSan}, playing ${choice.san}` });
    trace.setResult({ path: choice.branch.path, picked: choice.san });
  }

  if (isDevLogEnabled(DEBUG_LOG_TYPE)) {
    logBotMove({
      bot: bot.name,
      elo: bot.elo,
      ply: plyCount,
      engineMode: debug.mode,
      selected: choice.branch.isMiss ? 'tactics' : deriveEngineSource(debug, choice.san),
      path: choice.branch.path,
      internal: debug.internal,
      external: debug.external,
      browser: debug.browser,
      lightBrowser: debug.lightBrowser,
      cached: 'none',
      tactics: choice.checked.length
        ? {
            candidates: choice.checked.map((move) => ({
              move: move.san,
              cp: move.evalAfter.cp,
              mateIn: move.evalAfter.mateIn,
              tactic: move.tier,
              selected: move.san === choice.san
            })),
            time: formatMs(Date.now() - pickStart)
          }
        : 'none',
      picked: choice.san,
      pickedCp: choice.evalAfter?.cp ?? null,
      pickedMateIn: choice.evalAfter?.mateIn ?? null,
      totalTime: formatMs(Date.now() - start)
    });
  }

  return { san: choice.san, usedBook: false, analysis, evalAfter: choice.evalAfter };
}

interface Choice {
  san: string;
  branch: BotBranch;
  evalAfter: EvalScore | null;
  /** Moves the engine was asked about (a miss branch only). */
  checked: VerifiedMove[];
}

interface ChooseInput {
  deps: BotMoveSelectorDependencies;
  fen: string;
  bot: BotConfig;
  decision: BotBranchDecision;
  rolls: number[];
  candidates: BotCandidate[];
  analysis: PositionAnalysis;
  best: BotCandidate;
  lastMove: LastMove | null;
  trace: BotMoveTrace | undefined;
}

async function choose(input: ChooseInput): Promise<Choice> {
  const { deps, fen, bot, decision, rolls, candidates, analysis, best, lastMove, trace } = input;
  const [r1, , r3] = rolls;

  if (decision.kind === 'top') {
    const reason = `roll ${fmt(r1)} < top-moves chance ${bot.topFiveChance}`;
    if (playsBestMove(decision.r2, best, bot)) {
      return { san: best.moveSan, branch: { isMiss: false, path: 'top moves — best move', reason }, evalAfter: lineEval(analysis, best.moveSan), checked: [] };
    }
    const alternate = pickAnotherTopFive(candidates, bot.personality, deps.random) ?? best;
    return {
      san: alternate.moveSan,
      branch: { isMiss: false, path: 'top moves — alternate', reason },
      evalAfter: lineEval(analysis, alternate.moveSan),
      checked: []
    };
  }

  const missReason = `roll ${fmt(r1)} missed top-moves chance ${bot.topFiveChance}; ${decision.wanted} roll ${fmt(r3)} vs ${bot.blunderGivenMissChance}`;
  const playBest = (why: string): Choice => ({
    san: best.moveSan,
    branch: { isMiss: false, path: 'best move', reason: `${missReason}; ${why}` },
    evalAfter: lineEval(analysis, best.moveSan),
    checked: []
  });

  const baseline = { cp: best.cp, mateIn: best.mateIn };
  const state = positionState(baseline);
  if (state === 'losing') return playBest('the bot is far behind, so no mistake is injected');

  const batcher = createMistakeBatcher({
    fen,
    candidates: legalMoveCandidates(fen),
    lastMove,
    personality: bot.personality,
    diagnosisCodes: bot.diagnosisCodes,
    random: deps.random
  });
  const search = await searchForMistake({
    fen,
    mover: fenMover(fen),
    baseline,
    state,
    wanted: decision.wanted,
    batcher,
    verify: deps.verifyBotPosition ?? ((fenAfter) => defaultVerify(deps, fenAfter)),
    trace
  });

  const path = decision.wanted === 'blunder' ? 'tactics pool — blunder' : 'tactics pool — tactical mistake';
  if (search.found) {
    return { san: search.found.san, branch: { isMiss: true, path, reason: missReason }, evalAfter: search.found.evalAfter, checked: search.tried };
  }

  const closest = closestToAMistake(search.tried);
  if (closest) {
    // "Just play something": everything it checked turned out fine, so the
    // least fine of them — its eval is already known.
    return {
      san: closest.san,
      branch: { isMiss: true, path, reason: `${missReason}; none of ${search.tried.length} checked was bad enough, played the closest` },
      evalAfter: closest.evalAfter,
      checked: search.tried
    };
  }
  return { ...playBest('no mistake could be checked with the engine'), checked: search.tried };
}

function defaultVerify(deps: BotMoveSelectorDependencies, fenAfter: string): Promise<PositionAnalysis> {
  return deps.analyzeBotPosition(fenAfter, { depth: Math.min(BOT_VERIFY_DEPTH, BOT_SEARCH_DEPTH), multiPv: 1, movetimeMs: BOT_VERIFY_MOVETIME_MS });
}

function lineEval(analysis: PositionAnalysis, san: string): EvalScore | null {
  const line = analysis.lines.find((candidate) => candidate.moveSan === san);
  return line ? { cp: line.cp, mateIn: line.mateIn } : null;
}

function fenMover(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function fmt(roll: number | undefined): string {
  return roll === undefined ? '?' : roll.toFixed(2);
}

function lookUpBookMove(
  deps: BotMoveSelectorDependencies,
  fen: string,
  plyCount: number,
  bot: BotConfig,
  trace: BotMoveTrace | undefined
): ReturnType<typeof selectBookMove> {
  const step = trace?.begin('Opening book lookup', `ply ${plyCount}`);
  const book = (deps.selectBook ?? selectBookMove)(fen, plyCount, bot, deps.random);
  if (trace && step !== undefined) trace.end(step, { detail: book ? `book move ${book.san}` : 'not in the book — asking the engine' });
  return book;
}

/** The engine search + annotation, retried on failure. Records which engine
 * mode the search reported even when every attempt failed — the light/main
 * backends set it before they make their call. */
async function searchCandidates(
  deps: BotMoveSelectorDependencies,
  fen: string,
  lines: number,
  debug: ReturnType<typeof newBotMoveDebugCollector>,
  trace: BotMoveTrace | undefined
): Promise<BotSearchResult> {
  try {
    return await withEngineRetry(
      (attempt) =>
        searchBotCandidates(deps, fen, debug, trace && { trace, attempt, attempts: ENGINE_RETRY_ATTEMPTS }, lines),
      trace
    );
  } finally {
    if (trace && debug.mode) trace.setEngineMode(debug.mode);
  }
}
