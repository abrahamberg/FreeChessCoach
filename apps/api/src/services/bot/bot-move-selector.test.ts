import { describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// No book entries for this contrived endgame FEN — forces the engine+scoring path.
const OFF_BOOK_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

function baseBot(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    avatarIndex: 0,
    description: 'A bot for tests.',
    elo: 800,
    depth: 6,
    multiPv: 3,
    personality: { aggression: 50, trapSeeking: 50, defensiveness: 50 },
    aiEnabled: false,
    temperature: 0.3,
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
    callTiebreak: vi.fn().mockResolvedValue(null),
    random: () => 0,
    ...overrides
  };
}

describe('selectBotMove', () => {
  test('takes the book path when a book move is available and within budget', async () => {
    const deps = baseDeps();
    const result = await selectBotMove(deps, START_FEN, 0, baseBot({ bookPlies: 8 }));
    expect(result.usedBook).toBe(true);
    expect(result.usedAi).toBe(false);
    expect(deps.analyzeBotPosition).not.toHaveBeenCalled();
  });

  test('AI-off never calls the tiebreak, even with a close cluster', async () => {
    const deps = baseDeps();
    await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ aiEnabled: false }));
    expect(deps.callTiebreak).not.toHaveBeenCalled();
  });

  test('AI-on with a close cluster calls the tiebreak with that cluster and uses its valid answer', async () => {
    const deps = baseDeps({ callTiebreak: vi.fn().mockResolvedValue('Kd2') });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ aiEnabled: true }));

    expect(deps.callTiebreak).toHaveBeenCalledTimes(1);
    const call = (deps.callTiebreak as ReturnType<typeof vi.fn>).mock.calls.at(0)?.[0];
    expect(call?.candidates.map((c: { moveSan: string }) => c.moveSan)).toEqual(expect.arrayContaining(['Ke2', 'Kd2']));
    expect(result).toEqual({ san: 'Kd2', usedBook: false, usedAi: true });
  });

  test('AI-on falls back to sampling when the tiebreak returns null', async () => {
    const deps = baseDeps({ callTiebreak: vi.fn().mockResolvedValue(null), random: () => 0 });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ aiEnabled: true }));
    expect(result.usedAi).toBe(false);
    expect(['Ke2', 'Kd2']).toContain(result.san);
  });

  test('AI-on falls back to sampling when the tiebreak returns a SAN outside the cluster', async () => {
    const deps = baseDeps({ callTiebreak: vi.fn().mockResolvedValue('Qh5') });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ aiEnabled: true }));
    expect(result.usedAi).toBe(false);
  });

  test('AI-on with only one candidate in the top cluster skips the LLM call entirely', async () => {
    const deps = baseDeps({
      analyzeBotPosition: vi.fn().mockResolvedValue(
        analysis([
          { moveUci: 'e1e2', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 500, mateIn: null },
          { moveUci: 'e1d2', moveSan: 'Kd2', pvSan: ['Kd2'], cp: -500, mateIn: null }
        ])
      )
    });
    const result = await selectBotMove(deps, OFF_BOOK_FEN, 0, baseBot({ aiEnabled: true }));
    expect(deps.callTiebreak).not.toHaveBeenCalled();
    expect(result.san).toBe('Ke2');
    expect(result.usedAi).toBe(false);
  });
});
