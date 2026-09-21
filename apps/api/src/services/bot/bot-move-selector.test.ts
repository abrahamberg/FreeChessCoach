import { describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { BOT_SEARCH_DEPTH } from './bot-candidates.js';
import { createBotMoveTrace } from './bot-move-trace.js';
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

  describe('the search it did', () => {
    test('an engine move carries the analysis it was chosen from, so the turn can rate moves without another engine call', async () => {
      const deps = baseDeps({ random: () => 0 });
      const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot());

      expect(result.usedBook).toBe(false);
      expect(result.analysis?.lines.map((line) => line.moveSan)).toEqual(['Ke2', 'Kd2']);
      expect(result.analysis?.fen).toBe(OFF_BOOK_FEN);
    });

    test('a book move did no search, so there is no analysis', async () => {
      const result = await selectBotMove(baseDeps(), START_FEN, 0, baseBot({ bookPlies: 8 }));

      expect(result.usedBook).toBe(true);
      expect(result.analysis).toBeNull();
    });
  });

  describe('thinking trace', () => {
    function newTrace() {
      return createBotMoveTrace({ now: Date.now, source: 'turn', ply: 0 });
    }

    test('a book move records just the book lookup and the path', async () => {
      const trace = newTrace();
      await selectBotMove(baseDeps(), START_FEN, 0, baseBot({ bookPlies: 8 }), trace);

      const snapshot = trace.snapshot();
      expect(snapshot.steps.map((step) => step.label)).toEqual(['Opening book lookup']);
      expect(snapshot.steps[0]?.status).toBe('done');
      expect(snapshot).toMatchObject({ path: 'opening book' });
      expect(snapshot.picked).toBeTruthy();
    });

    test('an engine move records book miss, engine search, annotation and the choice, in order', async () => {
      const trace = newTrace();
      await selectBotMove(baseDeps({ random: () => 0 }), OFF_BOOK_FEN, 0, baseBot(), trace);

      const snapshot = trace.snapshot();
      expect(snapshot.steps.map((step) => step.label)).toEqual([
        'Opening book lookup',
        'Engine search (attempt 1 of 3)',
        'Choosing move'
      ]);
      expect(snapshot.steps.every((step) => step.status === 'done')).toBe(true);
      expect(snapshot.steps[1]?.detail).toContain('2 lines');
      expect(snapshot).toMatchObject({ path: 'top moves — best move', picked: 'Ke2' });
    });

    test('names the tactics-pool path when the %A roll misses', async () => {
      const trace = newTrace();
      await selectBotMove(baseDeps({ random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot(), trace);

      expect(trace.snapshot().path).toBe('tactics pool — tactical mistake');
    });

    test('carries the engine mode the search reported', async () => {
      const analyzeBotPosition = vi.fn().mockImplementation(async (_fen: string, opts: { debug?: { mode: string | null } }) => {
        if (opts.debug) opts.debug.mode = 'external';
        return analysis([{ moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null }]);
      });
      const trace = newTrace();
      await selectBotMove(baseDeps({ analyzeBotPosition }), OFF_BOOK_FEN, 0, baseBot(), trace);

      expect(trace.snapshot().engineMode).toBe('external');
    });

    test('a failed attempt and its backoff wait each get their own step', async () => {
      const analyzeBotPosition = vi
        .fn()
        .mockRejectedValueOnce(new Error('engine timeout'))
        .mockResolvedValueOnce(analysis([{ moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null }]));
      const trace = newTrace();

      vi.useFakeTimers();
      try {
        const resultPromise = selectBotMove(baseDeps({ analyzeBotPosition }), OFF_BOOK_FEN, 0, baseBot(), trace);
        await vi.runAllTimersAsync();
        await resultPromise;
      } finally {
        vi.useRealTimers();
      }

      const steps = trace.snapshot().steps;
      expect(steps.map((step) => [step.label, step.status])).toEqual([
        ['Opening book lookup', 'done'],
        ['Engine search (attempt 1 of 3)', 'failed'],
        ['Waiting before retry', 'done'],
        ['Engine search (attempt 2 of 3)', 'done'],
        ['Choosing move', 'done']
      ]);
      expect(steps[1]?.detail).toBe('engine timeout');
    });
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

describe('selectBotMove: the branch decides what the engine is asked', () => {
  const KING_MOVES = ['Kd1', 'Kd2', 'Ke2', 'Kf1', 'Kf2'];
  const ke2 = { moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null };
  const search = (...lines: PositionAnalysis['lines']) => vi.fn().mockResolvedValue(analysis(lines.length > 0 ? lines : [ke2]));
  const after = (cp: number) => vi.fn().mockResolvedValue(analysis([{ moveUci: 'e8e7', moveSan: 'Ke7', pvSan: ['Ke7'], cp, mateIn: null }]));

  test('a top-moves branch asks for five lines, a miss for one', async () => {
    const top = search();
    await selectBotMove(baseDeps({ analyzeBotPosition: top, random: () => 0 }), OFF_BOOK_FEN, 0, baseBot());
    expect(top).toHaveBeenCalledWith(OFF_BOOK_FEN, expect.objectContaining({ multiPv: 5 }));

    const miss = search();
    await selectBotMove(baseDeps({ analyzeBotPosition: miss, verifyBotPosition: after(-400), random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot());
    expect(miss).toHaveBeenCalledWith(OFF_BOOK_FEN, expect.objectContaining({ multiPv: 1 }));
  });

  test('the best move keeps the engine\'s own score for the position it leaves', async () => {
    const result = await selectBotMove(baseDeps({ analyzeBotPosition: search(), random: () => 0 }), OFF_BOOK_FEN, 0, baseBot());

    expect(result).toMatchObject({ san: 'Ke2', evalAfter: { cp: 5, mateIn: null } });
  });

  test('another top move carries that line\'s own score', async () => {
    const kd2 = { moveUci: 'e1d2', moveSan: 'Kd2', pvSan: ['Kd2'], cp: -20, mateIn: null };
    // r1 hits the top-moves chance, r2 misses the best-move chance.
    const rolls = [0.1, 0.9, 0.9];
    const deps = baseDeps({ analyzeBotPosition: search(ke2, kd2), random: () => rolls.shift() ?? 0 });

    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ topFiveChance: 0.6, bestMoveGivenTopFiveChance: 0.5 }));

    expect(result).toMatchObject({ san: 'Kd2', evalAfter: { cp: -20 } });
  });

  test('a mistake the engine confirms is played, with the score the engine gave for the position it leaves', async () => {
    const verify = after(-400);
    const trace = createBotMoveTrace({ now: Date.now, source: 'turn', ply: 0 });

    const result = await selectBotMove(baseDeps({ analyzeBotPosition: search(), verifyBotPosition: verify, random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot(), trace);

    expect(KING_MOVES).toContain(result.san);
    expect(result.evalAfter).toEqual({ cp: -400, mateIn: null });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(trace.snapshot()).toMatchObject({ path: 'tactics pool — tactical mistake', picked: result.san });
  });

  test('a mistake that turns out fine is dropped and another is checked', async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(analysis([{ moveUci: 'e8e7', moveSan: 'Ke7', pvSan: ['Ke7'], cp: 5, mateIn: null }]))
      .mockResolvedValueOnce(analysis([{ moveUci: 'e8e7', moveSan: 'Ke7', pvSan: ['Ke7'], cp: -500, mateIn: null }]));

    const result = await selectBotMove(baseDeps({ analyzeBotPosition: search(), verifyBotPosition: verify, random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot());

    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.evalAfter).toEqual({ cp: -500, mateIn: null });
  });

  test('when nothing checked is bad enough it still plays the one it checked, with that move\'s own score', async () => {
    const trace = createBotMoveTrace({ now: Date.now, source: 'turn', ply: 0 });

    const result = await selectBotMove(baseDeps({ analyzeBotPosition: search(), verifyBotPosition: after(5), random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot(), trace);

    expect(KING_MOVES).toContain(result.san);
    expect(result.evalAfter).toEqual({ cp: 5, mateIn: null });
    expect(trace.snapshot().steps.find((step) => step.label === 'Choosing move')?.detail).toContain('none of 5 checked was bad enough');
  });

  test('a bot that is far behind plays its best move and never goes looking for a mistake', async () => {
    const losing = { moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 1500, mateIn: null };
    const verify = vi.fn();
    // FEN with black to move so a positive white score is the bot's LOSS.
    const blackToMove = '4k3/8/8/8/8/8/8/4K3 b - - 0 1';
    const engine = vi.fn().mockResolvedValue({ ...analysis([{ ...losing, moveSan: 'Ke7', moveUci: 'e8e7', pvSan: ['Ke7'] }]), fen: blackToMove });

    const result = await selectBotMove(baseDeps({ analyzeBotPosition: engine, verifyBotPosition: verify, random: () => 0.999999 }), blackToMove, 0, baseBot());

    expect(verify).not.toHaveBeenCalled();
    expect(result.san).toBe('Ke7');
  });

  test('an engine that cannot check the mistake leaves the bot playing its best move', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('no engine'));

    const result = await selectBotMove(baseDeps({ analyzeBotPosition: search(), verifyBotPosition: verify, random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot());

    expect(result.san).toBe('Ke2');
    expect(result.evalAfter).toEqual({ cp: 5, mateIn: null });
  });

  test('the check falls back to a small search on the bot\'s own engine when no verifier is wired', async () => {
    const engine = vi
      .fn()
      .mockResolvedValueOnce(analysis([ke2]))
      .mockResolvedValue(analysis([{ moveUci: 'e8e7', moveSan: 'Ke7', pvSan: ['Ke7'], cp: -400, mateIn: null }]));

    await selectBotMove(baseDeps({ analyzeBotPosition: engine, random: () => 0.999999 }), OFF_BOOK_FEN, 0, baseBot());

    expect(engine).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ multiPv: 1, depth: 12 }));
  });
});
