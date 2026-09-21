import { describe, expect, test } from 'vitest';
import { bookBreadthForElo, type BotConfig } from '@freechesscoach/shared';
import { bookMovesForFen } from './opening-book.js';
import { GUARANTEED_BOOK_MOVES, selectBookMove } from './bot-opening.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// After 1.e4 e5 2.Nf3 Nc6: still in book, four plies in — past the guaranteed moves.
const FOURTH_PLY_BOOK_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const OFF_BOOK_FEN = '8/8/8/4k3/8/8/4K3/8 w - - 0 50';

function baseBot(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    avatarIndex: 0,
    description: 'A bot for tests.',
    elo: 800,
    topFiveChance: 0.6,
    bestMoveGivenTopFiveChance: 0.5,
    blunderGivenMissChance: 0.2,
    personality: { aggression: 50, trapSeeking: 50, defensiveness: 50 },
    mateConversionChance: 0.9,
    diagnosisCodes: [],
    bookPlies: 8,
    bookMistakeChance: 0,
    ...overrides
  };
}

describe('selectBookMove', () => {
  test('returns a known book move when in book and within the book-ply budget', () => {
    const result = selectBookMove(START_FEN, 0, baseBot(), () => 0);
    expect(result).not.toBeNull();
    expect(typeof result?.san).toBe('string');
    expect(result?.san.length).toBeGreaterThan(0);
  });

  test('returns null once past the bot\'s book-ply budget (bookPlies * 2 halfmoves)', () => {
    const result = selectBookMove(START_FEN, 16, baseBot({ bookPlies: 8 }), () => 0);
    expect(result).toBeNull();
  });

  test('returns null when the position has no known book entries', () => {
    const result = selectBookMove(OFF_BOOK_FEN, 0, baseBot(), () => 0);
    expect(result).toBeNull();
  });

  test('a mistake-chance roll below bookMistakeChance defers to the engine path (null)', () => {
    const bot = baseBot({ bookMistakeChance: 0.5 });
    const result = selectBookMove(FOURTH_PLY_BOOK_FEN, 4, bot, () => 0.1);
    expect(result).toBeNull();
  });

  test('a mistake-chance roll at/above bookMistakeChance still follows book', () => {
    const bot = baseBot({ bookMistakeChance: 0.5 });
    const result = selectBookMove(FOURTH_PLY_BOOK_FEN, 4, bot, () => 0.99);
    expect(result).not.toBeNull();
  });

  test('every bot plays its first two moves from book, whatever its own book settings say', () => {
    const weakest = baseBot({ bookPlies: 0, bookMistakeChance: 1 });

    expect(GUARANTEED_BOOK_MOVES).toBe(2);
    // As White the bot moves at plies 0 and 2; as Black at plies 1 and 3.
    expect(selectBookMove(START_FEN, 0, weakest, () => 0)).not.toBeNull();
    expect(selectBookMove('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 1, weakest, () => 0)).not.toBeNull();
    expect(selectBookMove('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 2, weakest, () => 0)).not.toBeNull();
    expect(selectBookMove('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 3, weakest, () => 0)).not.toBeNull();
  });

  test('past the guaranteed moves a weak bot follows its own settings again', () => {
    const weakest = baseBot({ bookPlies: 0, bookMistakeChance: 1 });

    expect(selectBookMove(FOURTH_PLY_BOOK_FEN, 4, weakest, () => 0)).toBeNull();
  });

  test('a guaranteed book move still leaves book when the student already did — there is nothing to play', () => {
    expect(selectBookMove(OFF_BOOK_FEN, 1, baseBot({ bookPlies: 0 }), () => 0)).toBeNull();
  });

  test('bookMistakeChance 0 never defers regardless of random()', () => {
    const bot = baseBot({ bookMistakeChance: 0 });
    const result = selectBookMove(START_FEN, 0, bot, () => 0);
    expect(result).not.toBeNull();
  });

  // Task 64.7: opening breadth scales with elo — a beginner only ever sees
  // the book's first couple of entries for a position, even when theory
  // documents many more. random() near 1 picks the last index of whatever
  // slice is actually available, so a beginner's narrow cap (2 entries at
  // elo 300) can only ever pick index 0 or 1, while a top-tier bot's much
  // wider cap can reach a later entry in the same book list.
  test('a beginner-tier bot never reaches a book entry a wider elo cap can reach', () => {
    const beginnerEntries = bookMovesForFen(START_FEN).slice(0, bookBreadthForElo(300));
    const topTierEntries = bookMovesForFen(START_FEN).slice(0, bookBreadthForElo(2300));
    expect(beginnerEntries.length).toBeLessThan(topTierEntries.length);

    const beginner = baseBot({ elo: 300, bookMistakeChance: 0 });
    const result = selectBookMove(START_FEN, 0, beginner, () => 0.999999);
    const reachedIndex = topTierEntries.findIndex((entry) => entry.san === result?.san);
    expect(reachedIndex).toBeLessThan(beginnerEntries.length);
  });
});
