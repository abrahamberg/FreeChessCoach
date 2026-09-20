import { CONFIG } from './config.js';
import { toCpWhite, winPctFor } from './win-probability.js';

/** A score from the point of view of the side that is choosing the move
 * (positive = good for it) — `BotCandidate.cp`/`mateIn`'s convention. */
export interface MoverScore {
  cp: number | null;
  mateIn: number | null;
}

/** Win percentage (0-100) for the side the score is relative to. Mate
 * saturates through `toCpWhite`, so a mate is never "just a big cp". */
export function moverWinPct(score: MoverScore): number {
  return winPctFor('white', toCpWhite(score));
}

/** How much of the mover's winning chances a move gave away, in win-percentage
 * points. Judging in win% rather than raw centipawns is what makes an even
 * position behave: 250 cp is a disaster at +0.3. */
export function winPctLoss(before: MoverScore, after: MoverScore): number {
  return moverWinPct(before) - moverWinPct(after);
}

/** The same in centipawns, mate saturated like everywhere else. */
export function cpLoss(before: MoverScore, after: MoverScore): number {
  return toCpWhite(before) - toCpWhite(after);
}

export type MistakeTier = 'blunder' | 'mistake' | 'fine';

/** Where the bot stands before it moves: 'winning' and 'losing' are decided
 * positions, where the win percentage has all but flattened out. */
export type PositionState = 'winning' | 'losing' | 'open';

export function positionState(baseline: MoverScore): PositionState {
  const winPct = moverWinPct(baseline);
  if (winPct >= CONFIG.severity.dampingHighWin) return 'winning';
  if (winPct <= CONFIG.severity.dampingLowWin) return 'losing';
  return 'open';
}

/**
 * What a move gave away, in the unit its position is judged in: win-percentage
 * points in an open position, but CENTIPAWNS when the bot is far ahead. At
 * +8 a lost knight only takes the win chance from 98% to 95% — a "fine" move in
 * win-percentage terms, so a bot that is winning would never get to play a
 * tactical mistake at all — while in centipawns it is plainly a mistake. (A bot
 * that is far behind judges nothing: see `acceptsMistake`.) Only comparable
 * between moves judged in the same position, which is all it is used for.
 */
export function moveLoss(state: PositionState, before: MoverScore, after: MoverScore): number {
  return state === 'winning' ? cpLoss(before, after) : winPctLoss(before, after);
}

/** The label bands: an open position uses the same win-percentage drops the
 * move labels use (`CONFIG.severity`), so a bot's "blunder" is rated a blunder
 * afterwards; a winning one uses centipawn bands (`CONFIG.botMistake`). */
export function mistakeTier(state: PositionState, loss: number): MistakeTier {
  if (state === 'winning') {
    if (loss >= CONFIG.botMistake.decidedBlunderCpLoss) return 'blunder';
    if (loss >= CONFIG.botMistake.decidedMistakeCpLoss) return 'mistake';
    return 'fine';
  }
  if (loss > CONFIG.severity.mistakeMaxDrop) return 'blunder';
  if (loss > CONFIG.severity.inaccuracyMaxDrop) return 'mistake';
  return 'fine';
}

export type WantedMistake = 'blunder' | 'mistake';

/**
 * Is a move that measured `tier` the mistake this bot was after?
 *
 * - a blunder branch wants a blunder; a mistake branch takes a mistake or a
 *   blunder (anything that is not actually fine) — in a winning position too,
 *   where the tiers are measured in centipawns (`moveLoss`);
 * - bot far behind: never — it plays its best move instead (and the resign
 *   logic decides when to stop).
 */
export function acceptsMistake(state: PositionState, wanted: WantedMistake, tier: MistakeTier): boolean {
  if (state === 'losing') return false;
  return wanted === 'blunder' ? tier === 'blunder' : tier !== 'fine';
}
