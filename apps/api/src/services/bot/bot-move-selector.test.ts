import { describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { BOT_SEARCH_DEPTH } from './bot-candidates.js';
import { selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// No book entries for this contrived bare-king FEN — always forces the
// engine + %A/%B/%C path.
const OFF_BOOK_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

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
    bookPlies: 0,
    bookMistakeChance: 0,
    ...overrides
  };
}

function analysis(lines: PositionAnalysis['lines']): PositionAnalysis {
  return {
    fen: OFF_BOOK_FEN,
    depth: BOT_SEARCH_DEPTH,
    multiPv: lines.length,
    bestMove: lines[0]?.moveSan ?? null,
    eval: { cp: lines[0]?.cp ?? null, mateIn: lines[0]?.mateIn ?? null },
    lines,
    features: {} as PositionAnalysis['features']
  };
}

function baseDeps(overrides: Partial<BotMoveSelectorDependencies> = {}): BotMoveSelectorDependencies {
  return {
    analyzeBotPosition: vi.fn().mockResolvedValue(
      analysis([
        { moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null },
        { moveUci: 'e1d2', moveSan: 'Kd2', pvSan: ['Kd2'], cp: 4, mateIn: null }
      ])
    ),
    random: () => 0,
    ...overrides
  };
}

describe('selectBotMove', () => {
  test('takes the book path when a book move is available and within budget', async () => {
    const deps = baseDeps();
    const result = await selectBotMove(deps, START_FEN, 0, baseBot({ bookPlies: 8 }));
    expect(result.usedBook).toBe(true);
    expect(deps.analyzeBotPosition).not.toHaveBeenCalled();
  });

  test('all three rolls at 0 hit the %A and %B branches: plays the engine\'s own top candidate', async () => {
    const deps = baseDeps({ random: () => 0 });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ topFiveChance: 0.6, bestMoveGivenTopFiveChance: 0.5 }));
    expect(result.san).toBe('Ke2');
  });

  test('a %A roll that misses falls through to the TTC-based tactical-mistake pool', async () => {
    // random() 0.999999 misses topFiveChance and blunderGivenMissChance alike,
    // landing in pickTacticalMistake. Neither king move loses anywhere near
    // enough cp from Ke2 (candidates[0], cp 5) to clear the real-mistake
    // floor — Kd2 only loses 1cp — so nothing qualifies as an actual
    // mistake and the fallback picks the sample's own worst-scoring
    // candidate instead (Kd2, cp 4 < Ke2's cp 5).
    const deps = baseDeps({ random: () => 0.999999 });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ diagnosisCodes: [] }));
    expect(result.san).toBe('Kd2');
  });

  test('always searches at the fixed BOT_SEARCH_DEPTH, regardless of the bot or the position', async () => {
    const analyzeBotPosition = vi.fn().mockResolvedValue(analysis([{ moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null }]));
    const deps = baseDeps({ analyzeBotPosition, random: () => 0 });
    await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot());
    expect(analyzeBotPosition).toHaveBeenCalledWith(OFF_BOOK_FEN, expect.objectContaining({ depth: BOT_SEARCH_DEPTH }));
  });

  test('a forced mate uses mateConversionChance even when bestMoveGivenTopFiveChance would otherwise miss', async () => {
    const deps = baseDeps({
      analyzeBotPosition: vi.fn().mockResolvedValue(
        analysis([
          { moveUci: 'e1e2', moveSan: 'Ke2#', pvSan: ['Ke2#'], cp: null, mateIn: 1 },
          { moveUci: 'e1d2', moveSan: 'Kd2', pvSan: ['Kd2'], cp: 4, mateIn: null }
        ])
      ),
      // Hits %A (topFiveChance 0.9), and would miss bestMoveGivenTopFiveChance
      // (0.3) on its own — only mateConversionChance's max() saves it.
      random: () => 0.7
    });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ topFiveChance: 0.9, bestMoveGivenTopFiveChance: 0.3, mateConversionChance: 0.9 }));
    expect(result.san).toBe('Ke2#');
  });

  // A live bot move sits behind the player's "your move" round trip
  // (commitBotTurn) — a single dropped/timed-out engine call must not
  // strand the game. See withEngineRetry's doc comment.
  describe('engine retry', () => {
    test('recovers from a transient engine failure without surfacing an error', async () => {
      const analyzeBotPosition = vi
        .fn()
        .mockRejectedValueOnce(new Error('engine timeout'))
        .mockResolvedValueOnce(analysis([{ moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null }]));
      const deps = baseDeps({ analyzeBotPosition });

      vi.useFakeTimers();
      try {
        const resultPromise = selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot());
        await vi.runAllTimersAsync();
        const result = await resultPromise;
        expect(result.san).toBe('Ke2');
        expect(analyzeBotPosition).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    test('gives up and rejects once every retry attempt fails', async () => {
      const analyzeBotPosition = vi.fn().mockRejectedValue(new Error('engine down'));
      const deps = baseDeps({ analyzeBotPosition });

      vi.useFakeTimers();
      try {
        const resultPromise = selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot());
        const assertion = expect(resultPromise).rejects.toThrow('engine down');
        await vi.runAllTimersAsync();
        await assertion;
        expect(analyzeBotPosition).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
