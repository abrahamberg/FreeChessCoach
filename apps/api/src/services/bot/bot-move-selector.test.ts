import { describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// No book entries for this contrived endgame FEN — forces the engine path,
// and its low material also classifies as 'endgame' (see bot-game-phase.ts).
const OFF_BOOK_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function baseBot(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    avatarIndex: 0,
    description: 'A bot for tests.',
    elo: 800,
    phases: {
      opening: { depth: 6, bestMoveChance: 0.5 },
      middlegame: { depth: 6, bestMoveChance: 0.5 },
      endgame: { depth: 6, bestMoveChance: 0.5 }
    },
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
    depth: 6,
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

  test('a roll under bestMoveChance plays the engine\'s top-ranked candidate', async () => {
    const deps = baseDeps({ random: () => 0 });
    const result = await selectBotMove(
      deps,
      OFF_BOOK_FEN,
      0,
      baseBot({ phases: { opening: p(1), middlegame: p(1), endgame: p(1) } })
    );
    expect(result.san).toBe('Ke2');
  });

  test('a roll over bestMoveChance falls through to a personality-weighted pick', async () => {
    // bestMoveChance is 0 for every phase below, so random() < chance is
    // always false — the roll always misses and defers to the weighted pick.
    const deps = baseDeps({ random: () => 0.999 });
    const result = await selectBotMove(
      deps,
      OFF_BOOK_FEN,
      0,
      baseBot({ phases: { opening: p(0), middlegame: p(0), endgame: p(0) } })
    );
    expect(['Ke2', 'Kd2']).toContain(result.san);
  });

  test('resolves depth from the phase profile matching the position, not a flat bot-level depth', async () => {
    const analyzeBotPosition = vi.fn().mockResolvedValue(
      analysis([{ moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null }])
    );
    const deps = baseDeps({ analyzeBotPosition, random: () => 0 });
    await selectBotMove(
      deps,
      OFF_BOOK_FEN, // low material -> classifies as 'endgame'
      0,
      baseBot({
        phases: {
          opening: { depth: 3, bestMoveChance: 1 },
          middlegame: { depth: 3, bestMoveChance: 1 },
          endgame: { depth: 12, bestMoveChance: 1 }
        }
      })
    );
    expect(analyzeBotPosition).toHaveBeenCalledWith(OFF_BOOK_FEN, expect.objectContaining({ depth: 12 }));
  });

  test('a forced mate uses mateConversionChance even when bestMoveChance would otherwise miss', async () => {
    const deps = baseDeps({
      analyzeBotPosition: vi.fn().mockResolvedValue(
        analysis([
          { moveUci: 'e1e2', moveSan: 'Ke2#', pvSan: ['Ke2#'], cp: null, mateIn: 1 },
          { moveUci: 'e1d2', moveSan: 'Kd2', pvSan: ['Kd2'], cp: 4, mateIn: null }
        ])
      ),
      // Just over 0 (bestMoveChance) but well under 0.9 (mateConversionChance).
      random: () => 0.5
    });
    const result = await selectBotMove(
      deps,
      OFF_BOOK_FEN,
      0,
      baseBot({ phases: { opening: p(0), middlegame: p(0), endgame: p(0) }, mateConversionChance: 0.9 })
    );
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

function p(bestMoveChance: number): { depth: number; bestMoveChance: number } {
  return { depth: 6, bestMoveChance };
}
