import {
  coachBotConfig,
  coachLevel,
  fenActiveColor,
  gameOutcomeFromPgn,
  lastMoveOfPgn,
  mayMakeMistake,
  parseAnnotatedPgn,
  shouldPunish,
  toCpWhite,
  winPctFor,
  type ClassifiedMove,
  type EvalScore
} from '@freechesscoach/chess-analysis';
import type { CoachMoveKind, CoachMovePlan } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { selectBotMove, type BotMoveSelectorDependencies, type SelectedBotMove } from './bot/bot-move-selector.js';
import { currentFen } from './play-moves.js';

export interface CoachMovePlanDependencies {
  db: Kysely<Database>;
  /** The bot move selector's engine and randomness — the coach's move is
   * picked by the same selector the bots use, at the student's level. */
  selector: BotMoveSelectorDependencies;
}

/** Recent games the student's usual level is read from. */
const PRIOR_GAMES = 10;
/** A move that gives away at least this many win-percentage points is
 * reported as a mistake rather than an alternate. */
const MISTAKE_COST = 8;

/**
 * The move the coach will play at the live game's tip, picked in code before
 * the coach model runs (so the model plays it in its first step instead of
 * asking for candidates): at the student's usual level, shifted by how they
 * are playing this game (coach-level.ts), punishing their last move when a
 * player at that level would, and with at most one deliberate mistake per
 * cooldown. Null when it isn't the coach's move or the game is over.
 */
export async function planCoachMove(deps: CoachMovePlanDependencies, gameId: string, userId: string): Promise<CoachMovePlan | null> {
  const game = await gamesRepo.findById(deps.db, gameId);
  if (!game) return null;
  const fen = currentFen(game.pgn);
  const coachColor = game.userColor === 'white' ? 'black' : 'white';
  if (fenActiveColor(fen) !== coachColor || gameOutcomeFromPgn(game.pgn).isOver) return null;

  // One plan per position: a turn that resumes after a client tool, or a
  // second message before the coach has moved, plays the same move rather
  // than re-rolling (and re-searching) it.
  const key = `${gameId}:${fen}`;
  const cached = planCache.get(key);
  if (cached) return cached;
  const planned = pickPlan(deps, game, fen, coachColor, userId);
  remember(key, planned);
  return planned;
}

/** Starts the plan without waiting for it (the student's move was just
 * committed; the coach turn that follows awaits the same cached plan). A
 * failure is logged and left for that turn to retry. */
export function startCoachMovePlan(deps: CoachMovePlanDependencies, gameId: string, userId: string): void {
  planCoachMove(deps, gameId, userId).catch((error: unknown) => {
    console.error(`coach move plan (early start) failed for game ${gameId}:`, error);
  });
}

async function pickPlan(
  deps: CoachMovePlanDependencies,
  game: gamesRepo.GameRow,
  fen: string,
  coachColor: 'white' | 'black',
  userId: string
): Promise<CoachMovePlan> {
  const moves = game.annotatedPgn ? parseAnnotatedPgn(game.annotatedPgn, game.userColor) : [];
  const priorElo = median(await gamesRepo.listRecentEstimatedRatings(deps.db, userId, PRIOR_GAMES));
  const level = coachLevel({ priorElo, studentDrops: dropsOf(moves, true) });
  const bot = coachBotConfig(level.targetElo, {
    forceBest: shouldPunish(lastStudentDrop(moves), level.targetElo, deps.selector.random),
    noMistake: !mayMakeMistake(dropsOf(moves, false))
  });
  const selected = await selectBotMove(deps.selector, fen, pliesPlayed(fen), bot, undefined, lastMoveOfPgn(game.pgn));
  const costWinPct = costOf(selected, coachColor);
  return {
    san: selected.san,
    kind: kindOf(selected, costWinPct, bot.bestMoveGivenTopFiveChance === 1 && bot.topFiveChance === 1),
    levelElo: level.levelElo,
    targetElo: level.targetElo,
    performanceElo: level.performanceElo,
    costWinPct
  };
}

const PLAN_CACHE_SIZE = 500;
const planCache = new Map<string, Promise<CoachMovePlan>>();

function remember(key: string, planned: Promise<CoachMovePlan>): void {
  planCache.set(key, planned);
  // A failed pick is never reused: the next turn tries again.
  planned.catch(() => planCache.delete(key));
  const oldest = planCache.keys().next();
  if (planCache.size > PLAN_CACHE_SIZE && !oldest.done) planCache.delete(oldest.value);
}

/** Halfmoves played before this position (a live game always starts from the
 * initial position), from the FEN's own move counter. */
function pliesPlayed(fen: string): number {
  const fullmove = Number(fen.trim().split(/\s+/)[5] ?? '1');
  return (Number.isFinite(fullmove) ? fullmove - 1 : 0) * 2 + (fenActiveColor(fen) === 'black' ? 1 : 0);
}

function dropsOf(moves: readonly ClassifiedMove[], isUserMove: boolean): number[] {
  return moves.flatMap((move) => (move.isUserMove === isUserMove && move.quality !== 'book' && move.drop !== undefined ? [move.drop] : []));
}

function lastStudentDrop(moves: readonly ClassifiedMove[]): number | null {
  const last = moves.at(-1);
  return last?.isUserMove && last.quality !== 'book' ? (last.drop ?? null) : null;
}

/** Win-percentage points the move gives away against the engine's best. */
function costOf(selected: SelectedBotMove, mover: 'white' | 'black'): number | null {
  const best = selected.analysis?.lines[0];
  if (!best || !selected.evalAfter) return null;
  const bestScore: EvalScore = { cp: best.cp, mateIn: best.mateIn };
  return Math.max(0, winPctFor(mover, toCpWhite(bestScore)) - winPctFor(mover, toCpWhite(selected.evalAfter)));
}

function kindOf(selected: SelectedBotMove, costWinPct: number | null, punishing: boolean): CoachMoveKind {
  if (selected.usedBook) return 'book';
  const isBest = selected.analysis?.lines[0]?.moveSan === selected.san;
  if (isBest) return punishing ? 'punish' : 'best';
  return costWinPct !== null && costWinPct >= MISTAKE_COST ? 'mistake' : 'alternate';
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : Math.round(((sorted[middle - 1] ?? upper) + upper) / 2);
}
