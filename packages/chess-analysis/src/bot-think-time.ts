import type { MoveQuality, PositionAnalysis } from '@freechesscoach/shared';

/** The bot's own clock, as it stands before it moves. */
export interface BotThinkClock {
  initialMs: number;
  incrementMs: number;
  remainingMs: number;
}

export interface BotThinkInput {
  /** Position the bot is about to move in. */
  fen: string;
  /** Halfmoves played so far, before the bot's move. */
  plyCount: number;
  /** The move came from the opening book — a remembered move, not a calculated one. */
  usedBook: boolean;
  /** The engine's view of the position; null for a book move. */
  analysis: PositionAnalysis | null;
  /** How the student's last move was rated, when known — a strong move makes
   * the position harder for the bot, a blunder makes the reply easy. */
  playerQuality: MoveQuality | null;
  /** Null for an untimed game. */
  clock: BotThinkClock | null;
  random: () => number;
}

/** Never answer faster than this — even a recapture takes a moment. */
export const BOT_MIN_THINK_MS = 700;
/** A bot move is one held-open request, so no move is allowed to take longer. */
export const BOT_MAX_THINK_MS = 25_000;
/** Untimed games have no budget to spend, so they stay snappy. */
export const BOT_MAX_UNTIMED_THINK_MS = 6_000;
/** Book moves are recalled, not calculated. */
const BOOK_MAX_THINK_MS = 2_000;
/** Always leave this much on the bot's clock — it should never flag itself. */
const CLOCK_SAFETY_MS = 400;
/** A person spends a bit under the even share of the clock on an average move. */
const BUDGET_SHARE = 0.55;
const UNTIMED_BASE_MS = 4_000;

/**
 * How long a bot should "think" before playing, to feel like a person at a
 * clock rather than an engine on a timer:
 *
 * - the even share of the clock (remaining time over the moves still to
 *   play, plus most of the increment) is the budget;
 * - quick in the opening, longest in the middlegame, quicker again in the
 *   endgame;
 * - longer when the position asks for it — an only-move, or a student move
 *   that was strong; shorter for a forced move, a position with many equal
 *   moves, a blunder to punish, or a game already decided;
 * - squeezed as the clock runs low, and never more than a fraction of what
 *   is left;
 * - a random spread, with the odd long think and the odd instant reply.
 *
 * Pure: `random` is injected, same convention as bot-move-pick.ts.
 */
export function botThinkTimeMs(input: BotThinkInput): number {
  const fullMove = Math.floor(input.plyCount / 2) + 1;
  const baseMs = input.clock ? clockBudgetMs(input.clock, fullMove) : UNTIMED_BASE_MS;

  let ms = baseMs * phaseFactor(input.fen, fullMove);
  if (input.usedBook) {
    ms = Math.min(ms, BOOK_MAX_THINK_MS);
  } else {
    ms *= positionFactor(input.analysis) * qualityFactor(input.playerQuality);
  }
  ms *= jitter(input.random);

  const cap = input.clock ? clockCapMs(input.clock) : BOT_MAX_UNTIMED_THINK_MS;
  ms = Math.min(ms * timePressureFactor(input.clock), cap);
  return Math.round(Math.max(Math.min(BOT_MIN_THINK_MS, cap), ms));
}

function clockBudgetMs(clock: BotThinkClock, fullMove: number): number {
  const movesToGo = Math.max(12, 50 - fullMove);
  return BUDGET_SHARE * (clock.remainingMs / movesToGo + 0.75 * clock.incrementMs);
}

/** Ramps up through the opening, peaks in the middlegame, eases off as the
 * pieces come off. */
function phaseFactor(fen: string, fullMove: number): number {
  const pieces = countPieces(fen);
  const opening = Math.min(1, fullMove / 12);
  const openingFactor = 0.3 + 1.0 * opening;
  if (pieces <= 6) return Math.min(openingFactor, 0.6);
  if (pieces <= 12) return Math.min(openingFactor, 0.85);
  return openingFactor;
}

function countPieces(fen: string): number {
  const board = fen.split(' ')[0] ?? '';
  return (board.match(/[a-zA-Z]/g) ?? []).length;
}

/** What the engine's own lines say about how hard this position is. */
function positionFactor(analysis: PositionAnalysis | null): number {
  if (!analysis) return 1;
  const lines = analysis.lines;
  if (lines.length === 1 && analysis.multiPv > 1) return 0.2; // a single legal move
  const decided = Math.abs(scoreOf(analysis.eval.cp, analysis.eval.mateIn));
  if (decided > 600) return 0.6;

  const best = lines[0];
  const second = lines[1];
  if (!best || !second) return 1;
  const gap = Math.abs(scoreOf(best.cp, best.mateIn) - scoreOf(second.cp, second.mateIn));
  if (gap >= 150) return 1.6; // an only-move: worth a long look
  if (gap <= 20) return 0.8; // several moves are as good — pick one
  return 1;
}

function scoreOf(cp: number | null, mateIn: number | null): number {
  if (mateIn !== null) return mateIn > 0 ? 10_000 - mateIn : -10_000 - mateIn;
  return cp ?? 0;
}

function qualityFactor(quality: MoveQuality | null): number {
  switch (quality) {
    case 'brilliant':
    case 'great':
    case 'best':
      return 1.4;
    case 'inaccuracy':
      return 0.9;
    case 'mistake':
    case 'miss':
    case 'blunder':
      return 0.7;
    case 'forced':
      return 0.4;
    default:
      return 1;
  }
}

function jitter(random: () => number): number {
  const spread = 0.6 + random() * 0.9;
  const roll = random();
  if (roll < 0.06) return spread * 2.2; // the odd long think
  if (roll < 0.16) return spread * 0.4; // the odd instant reply
  return spread;
}

/** Below a tenth of the starting time (or 15 seconds) the bot hurries, in
 * proportion to how little is left. */
function timePressureFactor(clock: BotThinkClock | null): number {
  if (!clock) return 1;
  const threshold = Math.max(15_000, clock.initialMs * 0.1);
  if (clock.remainingMs >= threshold) return 1;
  return Math.max(0.1, clock.remainingMs / threshold);
}

function clockCapMs(clock: BotThinkClock): number {
  const spendable = Math.max(0, clock.remainingMs - CLOCK_SAFETY_MS);
  return Math.min(BOT_MAX_THINK_MS, spendable * 0.25);
}
