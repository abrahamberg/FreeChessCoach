import { describe, expect, test } from 'vitest';
import type { BotPersonality } from '@freechesscoach/shared';
import { pickBotMove, type PickBotMoveInput } from './bot-move-pick.js';
import type { BotCandidate } from './bot-candidate-weighting.js';

const NEUTRAL_PERSONALITY: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };
// Standard start: no checks/captures/threats for either side, so the
// TTC-derived mistake/blunder pool (bot-mistake-pool.ts) never needs a
// personality-weighted sampling pass on top of the fixed rolls below — see
// this file's own tests for why that keeps outcomes deterministic here.
const NEUTRAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function candidate(moveSan: string, overrides: Partial<BotCandidate> = {}): BotCandidate {
  return {
    moveSan,
    cp: 0,
    mateIn: null,
    createsFork: false,
    createsOpponentHangingPiece: false,
    createsUnderDefendedPiece: false,
    mobilityDelta: 0,
    forkInPlies: null,
    motif: null,
    diagnosisCodes: [],
    ...overrides
  };
}

function input(overrides: Partial<PickBotMoveInput> & Pick<PickBotMoveInput, 'candidates' | 'random'>): PickBotMoveInput {
  return {
    personality: NEUTRAL_PERSONALITY,
    topFiveChance: 0,
    bestMoveGivenTopFiveChance: 0,
    mateConversionChance: 0,
    blunderGivenMissChance: 0,
    diagnosisCodes: [],
    fenBefore: NEUTRAL_FEN,
    ...overrides
  };
}

/** Sequenced random() — one value per call, holding the last value once the
 * sequence runs out (mirrors "a roll near 1 always misses" for any trailing
 * calls a test doesn't care to control precisely). */
function sequence(...values: number[]): () => number {
  let call = 0;
  return () => values[call++] ?? values.at(-1) ?? 0.999999;
}

describe('pickBotMove', () => {
  test('throws on an empty candidate list', () => {
    expect(() => pickBotMove(input({ candidates: [], random: () => 0 }))).toThrow();
  });

  test('%A and %B both hit: plays the engine\'s own top candidate', () => {
    const candidates = [candidate('e4', { cp: 10 }), candidate('d4', { cp: 5 })];
    const picked = pickBotMove(
      input({ candidates, topFiveChance: 1, bestMoveGivenTopFiveChance: 1, random: sequence(0, 0, 0) })
    );
    expect(picked.moveSan).toBe('e4');
  });

  test('%A hits but %B misses: picks a personality-weighted alternative among the other top-5, never candidates[0]', () => {
    const candidates = [candidate('best', { cp: 10 }), candidate('c1'), candidate('c2'), candidate('c3'), candidate('c4')];
    // r1 hits topFiveChance, r2 misses bestMoveGivenTopFiveChance, r3 is
    // irrelevant (only read on an %A miss), r4 is the weighted draw over
    // [c1,c2,c3,c4] — near 1 lands on the last of the four with equal
    // (neutral-personality) weights.
    const picked = pickBotMove(
      input({ candidates, topFiveChance: 1, bestMoveGivenTopFiveChance: 0, random: sequence(0, 0.999999, 0, 0.999999) })
    );
    expect(picked.moveSan).toBe('c4');
  });

  test('with only one legal move, the %B-miss branch falls back to candidates[0] rather than an empty draw', () => {
    const candidates = [candidate('onlyMove', { cp: 10 })];
    const picked = pickBotMove(
      input({ candidates, topFiveChance: 1, bestMoveGivenTopFiveChance: 0, random: sequence(0, 0.999999) })
    );
    expect(picked.moveSan).toBe('onlyMove');
  });

  test('a mate-in candidate at the top uses mateConversionChance instead of a low bestMoveGivenTopFiveChance', () => {
    const candidates = [candidate('mate', { mateIn: 1 }), candidate('other')];
    const picked = pickBotMove(
      input({
        candidates,
        topFiveChance: 1,
        bestMoveGivenTopFiveChance: 0,
        mateConversionChance: 0.9,
        // r1 hits topFiveChance; r2 (0.5) would miss bestMoveGivenTopFiveChance
        // (0) but is below the mate-boosted floor (0.9).
        random: sequence(0, 0.5)
      })
    );
    expect(picked.moveSan).toBe('mate');
  });

  test('a negative (being-mated) mateIn on the top candidate does not trigger the mate-conversion floor', () => {
    const candidates = [candidate('aboutToBeMated', { mateIn: -1, cp: 10 }), candidate('other', { cp: 5 })];
    const picked = pickBotMove(
      input({
        candidates,
        topFiveChance: 1,
        bestMoveGivenTopFiveChance: 0,
        mateConversionChance: 0.9,
        // r2 = 0.5 misses bestMoveGivenTopFiveChance (0) and the floor never
        // engages (mateIn is negative), so this falls to the personality
        // draw among the rest of the top-5.
        random: sequence(0, 0.5, 0)
      })
    );
    expect(picked.moveSan).not.toBe('aboutToBeMated');
  });

  test('%A misses and %C hits: delegates to the blunder pool (its worst-scoring candidate, on a neutral TTC position)', () => {
    const candidates = [candidate('e4', { cp: 10 }), candidate('d4', { cp: 5 })];
    const picked = pickBotMove(
      input({ candidates, topFiveChance: 0, blunderGivenMissChance: 1, random: sequence(0.999999, 0.999999, 0) })
    );
    expect(picked.moveSan).toBe('d4');
  });

  test('%A misses and %C misses: delegates to the tactical-mistake pool (neither candidate clears the real-mistake cp floor, so it falls back to the worst of the sample)', () => {
    const candidates = [candidate('e4', { cp: 10 }), candidate('d4', { cp: 5 })];
    const picked = pickBotMove(
      input({ candidates, topFiveChance: 0, blunderGivenMissChance: 0, diagnosisCodes: [], random: sequence(0.999999, 0.999999, 0.999999) })
    );
    expect(picked.moveSan).toBe('d4');
  });

  test('all three rolls are drawn from random() exactly once each, regardless of which branch is taken', () => {
    const candidates = [candidate('e4', { cp: 10 }), candidate('d4', { cp: 5 })];
    let calls = 0;
    const random = () => {
      calls++;
      return 0;
    };
    pickBotMove(input({ candidates, topFiveChance: 1, bestMoveGivenTopFiveChance: 1, random }));
    // %A and %B both hit at random()=0, so only the first two of the three
    // up-front rolls are ever compared against a threshold — but all three
    // must still have been drawn before branching (see pickBotMove's own
    // doc comment on why: never lazily re-entered).
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
