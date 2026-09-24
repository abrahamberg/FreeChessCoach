import { describe, expect, test } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { BOT_MAX_THINK_MS, BOT_MAX_UNTIMED_THINK_MS, BOT_MIN_THINK_MS, botThinkTimeMs, type BotThinkInput } from './bot-think-time.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIDDLEGAME = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 9';
const ENDGAME = '8/5pk1/6p1/8/3R4/6P1/5PK1/8 w - - 0 40';
const TEN_MIN = { initialMs: 600_000, incrementMs: 0, remainingMs: 600_000 };
// random() === 0.5 is a plain spread (1.05) — no long think, no instant reply.
const STEADY = () => 0.5;

function analysis(scores: number[], eval_cp = 0): PositionAnalysis {
  return {
    fen: MIDDLEGAME,
    depth: 12,
    multiPv: 5,
    bestMove: 'e2e4',
    eval: { cp: eval_cp, mateIn: null },
    lines: scores.map((cp, i) => ({ moveUci: `m${i}`, moveSan: `m${i}`, pvSan: [`m${i}`], cp, mateIn: null })),
    features: {} as PositionAnalysis['features']
  };
}

function input(overrides: Partial<BotThinkInput> = {}): BotThinkInput {
  return { fen: MIDDLEGAME, plyCount: 20, usedBook: false, analysis: analysis([30, 0, -40]), playerQuality: null, clock: TEN_MIN, random: STEADY, ...overrides };
}

describe('botThinkTimeMs', () => {
  test('plays the opening faster than the middlegame, and the endgame faster again', () => {
    const opening = botThinkTimeMs(input({ fen: START, plyCount: 2, usedBook: true, analysis: null }));
    const middle = botThinkTimeMs(input());
    const endgame = botThinkTimeMs(input({ fen: ENDGAME, plyCount: 80, clock: { ...TEN_MIN, remainingMs: 240_000 } }));
    expect(opening).toBeLessThan(middle);
    expect(endgame).toBeLessThan(middle);
  });

  test('thinks longer on an only-move than when several moves are as good', () => {
    const onlyMove = botThinkTimeMs(input({ analysis: analysis([200, 0, -50]) }));
    const manyGood = botThinkTimeMs(input({ analysis: analysis([10, 5, 0]) }));
    expect(onlyMove).toBeGreaterThan(manyGood);
  });

  test('thinks longer after a strong student move than after a blunder', () => {
    expect(botThinkTimeMs(input({ playerQuality: 'best' }))).toBeGreaterThan(botThinkTimeMs(input({ playerQuality: 'blunder' })));
  });

  test('a single legal move is answered quickly', () => {
    const forced = analysis([0]);
    forced.multiPv = 5;
    expect(botThinkTimeMs(input({ analysis: forced }))).toBeLessThan(botThinkTimeMs(input()) / 2);
  });

  test('speeds up as its own clock runs low and never spends more than a quarter of what is left', () => {
    const plenty = botThinkTimeMs(input());
    const low = botThinkTimeMs(input({ clock: { ...TEN_MIN, remainingMs: 8_000 } }));
    expect(low).toBeLessThan(plenty);
    expect(low).toBeLessThanOrEqual(2_000);
  });

  test('never exceeds the remaining clock, even with almost none left', () => {
    const ms = botThinkTimeMs(input({ clock: { ...TEN_MIN, remainingMs: 500 } }));
    expect(ms).toBeLessThan(500);
  });

  test('a long increment lets it think longer than the same clock without one', () => {
    const clock = { initialMs: 300_000, incrementMs: 0, remainingMs: 300_000 };
    expect(botThinkTimeMs(input({ clock: { ...clock, incrementMs: 10_000 } }))).toBeGreaterThan(botThinkTimeMs(input({ clock })));
  });

  test('is bounded: a floor for a fast reply, a ceiling for a tank, a lower ceiling untimed', () => {
    const fast = botThinkTimeMs(input({ fen: START, plyCount: 0, usedBook: true, analysis: null, random: () => 0.1 }));
    expect(fast).toBeGreaterThanOrEqual(BOT_MIN_THINK_MS);
    const tank = botThinkTimeMs(input({ clock: { initialMs: 7_200_000, incrementMs: 30_000, remainingMs: 7_200_000 }, random: () => 0.01, analysis: analysis([300, 0]) }));
    expect(tank).toBeLessThanOrEqual(BOT_MAX_THINK_MS);
    expect(botThinkTimeMs(input({ clock: null, random: () => 0.01 }))).toBeLessThanOrEqual(BOT_MAX_UNTIMED_THINK_MS);
  });

  test('the random spread varies the answer for the same position', () => {
    const times = new Set([0.2, 0.5, 0.9].map((r) => botThinkTimeMs(input({ random: () => r }))));
    expect(times.size).toBeGreaterThan(1);
  });
});
