import { bookMovesForFen } from './opening-book.js';
import { bookBreadthForElo, type BotConfig } from '@freechesscoach/shared';

export interface SelectedBookMove {
  san: string;
}

/** How many of its own first moves every bot plays from book (when the
 * position is in it), regardless of `bookPlies` or `bookMistakeChance`. */
export const GUARANTEED_BOOK_MOVES = 2;

/**
 * A bot's opening-book decision for one position: follow known theory,
 * "slip" out of book early, or defer to the normal engine+scoring path.
 * Pure (no I/O beyond the bundled book data) with an injected `random`
 * source, same convention as bot-move-pick.ts's pickBotMove.
 *
 * `plyCount` is halfmoves played so far (i.e. the ply the position is AT,
 * before this bot's move) — compared against `bot.bookPlies * 2` (at least
 * `GUARANTEED_BOOK_MOVES * 2`) since bookPlies counts the bot's OWN moves, not
 * halfmoves. A position the student has left book in simply has no entries, so
 * the bot leaves book with them.
 *
 * A "mistake" is deliberately not fabricated here: book entries carry no
 * frequency/weight data to pick a plausible-but-inferior one from, so a
 * mistake roll simply returns null (defer to the engine+scoring path),
 * which for a shallow/low-level bot naturally produces an imperfect
 * opening move on its own — no separate "bad move" logic needed.
 *
 * Variety: a bot's first `GUARANTEED_BOOK_MOVES` moves are drawn from EVERY
 * book reply, so it opens and answers with a different line each game (1.e4,
 * 1.d4, 1.c4, ... and every defence to them). Later book moves are drawn from
 * a random sample of `bookBreadthForElo(bot.elo)` replies — a low-rated bot
 * still knows fewer of theory's replies than a strong one, but not always the
 * same few. (Sampling is a shuffle over the book's list: there's no
 * popularity/frequency data in the source to weight by.)
 */
export function selectBookMove(
  fen: string,
  plyCount: number,
  bot: BotConfig,
  random: () => number
): SelectedBookMove | null {
  if (plyCount >= Math.max(bot.bookPlies, GUARANTEED_BOOK_MOVES) * 2) return null;

  const known = bookMovesForFen(fen);
  if (known.length === 0) return null;

  // Every bot, however weak, plays its first GUARANTEED_BOOK_MOVES moves from
  // book while the game is still in it — a move-one blunder from a bot whose
  // "book mistake" roll came up is not how anyone starts a game. Past those,
  // its own bookMistakeChance decides.
  const guaranteed = plyCount < GUARANTEED_BOOK_MOVES * 2;
  if (!guaranteed && random() < bot.bookMistakeChance) return null;

  const entries = guaranteed ? known : sample(known, bookBreadthForElo(bot.elo), random);
  const index = Math.floor(random() * entries.length);
  const entry = entries[Math.min(index, entries.length - 1)];
  if (!entry) return null;
  return { san: entry.san };
}

/** `count` entries chosen at random (a partial Fisher-Yates shuffle). */
function sample<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool.slice(0, take);
}
