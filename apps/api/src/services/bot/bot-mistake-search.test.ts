import { describe, expect, test, vi } from 'vitest';
import type { BotCandidate, MistakeBatcher } from '@freechesscoach/chess-analysis';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { createBotMoveTrace } from './bot-move-trace.js';
import { closestToAMistake, searchForMistake } from './bot-mistake-search.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EQUAL = { cp: 0, mateIn: null };

/** An analysis whose top line scores `cp` (White-perspective). */
function analysis(cp: number | null, mateIn: number | null = null): PositionAnalysis {
  return {
    fen: 'x',
    depth: 8,
    multiPv: 1,
    bestMove: null,
    eval: { cp, mateIn },
    lines: [{ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp, mateIn }],
    features: {} as PositionAnalysis['features']
  };
}

function batcherOf(...batches: string[][]): MistakeBatcher {
  const queue = [...batches];
  return { next: () => queue.shift()?.map((moveSan) => ({ moveSan }) as BotCandidate) ?? null };
}

function search(overrides: Partial<Parameters<typeof searchForMistake>[0]> & { verify: Parameters<typeof searchForMistake>[0]['verify'] }) {
  return searchForMistake({
    fen: START,
    mover: 'white',
    baseline: EQUAL,
    state: 'open',
    wanted: 'mistake',
    batcher: batcherOf(['e4', 'd4', 'Nf3', 'c4', 'g3'], ['b3', 'a3']),
    ...overrides
  });
}

describe('searchForMistake', () => {
  test('keeps the first move the engine confirms is a real mistake, after one check', async () => {
    const verify = vi.fn().mockResolvedValue(analysis(-300));

    const result = await search({ verify });

    expect(result.found).toMatchObject({ san: 'e4', tier: 'blunder' });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(expect.stringContaining(' b KQkq'));
  });

  test('a move that turns out fine is dropped and the next one is tried', async () => {
    const verify = vi.fn().mockResolvedValueOnce(analysis(10)).mockResolvedValueOnce(analysis(-150));

    const result = await search({ verify });

    expect(result.found?.san).toBe('d4');
    expect(result.tried.map((move) => move.san)).toEqual(['e4', 'd4']);
  });

  test('never checks more moves than the cap, and reports nothing found', async () => {
    const verify = vi.fn().mockResolvedValue(analysis(0));

    const result = await search({ verify });

    expect(verify).toHaveBeenCalledTimes(5);
    expect(result.found).toBeNull();
    expect(result.tried).toHaveLength(5);
  });

  test('carries on into the next batch when the first is used up before the cap', async () => {
    const verify = vi.fn().mockResolvedValue(analysis(0));

    const result = await search({ verify, batcher: batcherOf(['e4', 'd4'], ['Nf3', 'c4']) });

    expect(result.tried.map((move) => move.san)).toEqual(['e4', 'd4', 'Nf3', 'c4']);
  });

  test('a bot that is far behind does not go looking for a mistake at all', async () => {
    const verify = vi.fn();

    const result = await search({ verify, state: 'losing' });

    expect(verify).not.toHaveBeenCalled();
    expect(result).toEqual({ found: null, tried: [] });
  });

  test('a bot far ahead judges in centipawns: losing a pawn is a mistake it keeps, a tiny slip is not', async () => {
    const baseline = { cp: 900, mateIn: null };
    // 900 -> 880 is nothing; 900 -> 780 gives away a pawn and a bit.
    const verify = vi.fn().mockResolvedValueOnce(analysis(880)).mockResolvedValueOnce(analysis(780));

    const result = await search({ verify, baseline, state: 'winning' });

    expect(result.tried.map((move) => move.tier)).toEqual(['fine', 'mistake']);
    expect(result.found?.san).toBe('d4');
  });

  test('a bot far ahead that would drop a piece has found a blunder, though its win chance barely moves', async () => {
    const baseline = { cp: 900, mateIn: null };
    const verify = vi.fn().mockResolvedValue(analysis(550));

    const result = await search({ verify, baseline, state: 'winning', wanted: 'blunder' });

    expect(result.found).toMatchObject({ san: 'e4', tier: 'blunder' });
  });

  test('a blunder branch does not settle for a mistake-sized move', async () => {
    const verify = vi.fn().mockResolvedValueOnce(analysis(-120)).mockResolvedValueOnce(analysis(-500));

    const result = await search({ verify, wanted: 'blunder' });

    expect(result.tried.map((move) => move.tier)).toEqual(['mistake', 'blunder']);
    expect(result.found?.san).toBe('d4');
  });

  test('scores are read from the bot\'s side: for Black, a big White score is the bot\'s mistake', async () => {
    const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const verify = vi.fn().mockResolvedValue(analysis(400));

    const result = await search({ verify, fen: blackFen, mover: 'black', batcher: batcherOf(['e5']) });

    expect(result.found).toMatchObject({ san: 'e5', tier: 'blunder', evalAfter: { cp: 400, mateIn: null } });
  });

  test('walking into a mate is a blunder however the score was given', async () => {
    const verify = vi.fn().mockResolvedValue(analysis(null, -2));

    const result = await search({ verify, batcher: batcherOf(['e4']) });

    expect(result.found?.tier).toBe('blunder');
    expect(result.found?.evalAfter).toEqual({ cp: null, mateIn: -2 });
  });

  test('stops once the time budget is spent, however many tries are left', async () => {
    let clock = 0;
    const verify = vi.fn().mockImplementation(async () => {
      clock += 4000;
      return analysis(0);
    });

    const result = await search({ verify, now: () => clock });

    expect(result.tried).toHaveLength(2);
  });

  test('an engine failure ends the search with whatever was already checked', async () => {
    const verify = vi.fn().mockResolvedValueOnce(analysis(0)).mockRejectedValueOnce(new Error('tunnel down'));

    const result = await search({ verify });

    expect(result.found).toBeNull();
    expect(result.tried.map((move) => move.san)).toEqual(['e4']);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  test('shows each check in the Thinking log with its outcome and no numbers', async () => {
    const trace = createBotMoveTrace({ now: () => 0, source: 'turn', ply: 2 });
    const verify = vi.fn().mockResolvedValueOnce(analysis(0)).mockResolvedValueOnce(analysis(-400));

    await search({ verify, trace });

    expect(trace.snapshot().steps.map((step) => [step.label, step.detail])).toEqual([
      ['Checking e4 with the engine (try 1 of 5)', 'too good a move — trying another'],
      ['Checking d4 with the engine (try 2 of 5)', 'a blunder — kept']
    ]);
  });
});

describe('closestToAMistake', () => {
  test('is the checked move that gave away the most', () => {
    const tried = [
      { san: 'a', tier: 'fine' as const, loss: 1, evalAfter: EQUAL },
      { san: 'b', tier: 'fine' as const, loss: 6, evalAfter: EQUAL },
      { san: 'c', tier: 'fine' as const, loss: 3, evalAfter: EQUAL }
    ];

    expect(closestToAMistake(tried)?.san).toBe('b');
  });

  test('is null when nothing was checked', () => {
    expect(closestToAMistake([])).toBeNull();
  });
});
