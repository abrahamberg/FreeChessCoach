import { bookMovesForFen } from './opening-book.js';
import { bookBreadthForElo, type BotConfig } from '@freechesscoach/shared';

export interface SelectedBookMove {
  san: string;
}

/**
 * A bot's opening-book decision for one position: follow known theory,
 * "slip" out of book early, or defer to the normal engine+scoring path.
 * Pure (no I/O beyond the bundled book data) with an injected `random`
 * source, same convention as bot-move-pick.ts's pickBotMove.
 *
 * `plyCount` is halfmoves played so far (i.e. the ply the position is AT,
 * before this bot's move) — compared against `bot.bookPlies * 2` since
 * bookPlies counts the bot's OWN moves, not halfmoves.
 *
 * A "mistake" is deliberately not fabricated here: book entries carry no
 * frequency/weight data to pick a plausible-but-inferior one from, so a
 * mistake roll simply returns null (defer to the engine+scoring path),
 * which for a shallow/low-level bot naturally produces an imperfect
 * opening move on its own — no separate "bad move" logic needed.
 *
 * The candidate pool is also truncated to `bookBreadthForElo(bot.elo)`
 * entries before the random pick — a low-rated bot only knows a couple of
 * "correct" replies for a given position even when theory documents many
 * more, widening toward the book's own real ceiling at the roster's top
 * tier (see bot-roster.ts's doc comment on that curve).
 */
export function selectBookMove(
  fen: string,
  plyCount: number,
  bot: BotConfig,
  random: () => number
): SelectedBookMove | null {
  if (plyCount >= bot.bookPlies * 2) return null;

  const entries = bookMovesForFen(fen).slice(0, bookBreadthForElo(bot.elo));
  if (entries.length === 0) return null;

  if (random() < bot.bookMistakeChance) return null;

  const index = Math.floor(random() * entries.length);
  const entry = entries[Math.min(index, entries.length - 1)];
  if (!entry) return null;
  return { san: entry.san };
}
