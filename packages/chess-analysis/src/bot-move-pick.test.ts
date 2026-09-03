import { describe, expect, test } from 'vitest';
import { pickBotMove, type BotCandidate } from './bot-move-pick.js';
import type { BotPersonality } from '@freechesscoach/shared';

const NEUTRAL_PERSONALITY: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };

function candidate(overrides: Partial<BotCandidate> = {}): BotCandidate {
  return {
    moveSan: 'e4',
    cp: 0,
    mateIn: null,
    createsFork: false,
    createsHangingPiece: false,
    createsUnderDefendedPiece: false,
    mobilityDelta: 0,
    forkInPlies: null,
    motif: null,
    ...overrides
  };
}

describe('pickBotMove', () => {
  test('throws on an empty candidate list', () => {
    expect(() =>
      pickBotMove({ candidates: [], personality: NEUTRAL_PERSONALITY, bestMoveChance: 0.5, mateConversionChance: 0.5, random: () => 0 })
    ).toThrow();
  });

  test('bestMoveChance 1 always plays the engine top candidate, even when random() is near the boundary', () => {
    const candidates = [candidate({ moveSan: 'best' }), candidate({ moveSan: 'other' })];

    for (const randomValue of [0, 0.5, 0.999999]) {
      const picked = pickBotMove({
        candidates,
        personality: NEUTRAL_PERSONALITY,
        bestMoveChance: 1,
        mateConversionChance: 1,
        random: () => randomValue
      });
      expect(picked.moveSan).toBe('best');
    }
  });

  test('bestMoveChance 0 with no mate always defers to the personality-weighted pick', () => {
    const candidates = [candidate({ moveSan: 'best' }), candidate({ moveSan: 'other' })];
    // random() sequence: first call is the bestMoveChance roll (must miss,
    // i.e. not be < 0), second call is the weighted draw.
    const rolls = [0.999999, 0.999999];
    let call = 0;
    const random = () => rolls[call++] ?? 0.999999;

    const picked = pickBotMove({ candidates, personality: NEUTRAL_PERSONALITY, bestMoveChance: 0, mateConversionChance: 0, random });

    // With equal weights and random() near 1, the weighted draw lands on the last candidate.
    expect(picked.moveSan).toBe('other');
  });

  test('a mate-in candidate at the top uses mateConversionChance instead of a low bestMoveChance', () => {
    const candidates = [candidate({ moveSan: 'mate', mateIn: 1 }), candidate({ moveSan: 'other' })];

    const picked = pickBotMove({
      candidates,
      personality: NEUTRAL_PERSONALITY,
      bestMoveChance: 0,
      mateConversionChance: 0.9,
      // Below mateConversionChance (0.9) but would have missed bestMoveChance (0).
      random: () => 0.5
    });

    expect(picked.moveSan).toBe('mate');
  });

  test('a negative (being-mated) mateIn on the top candidate does not trigger the mate-conversion floor', () => {
    const candidates = [candidate({ moveSan: 'aboutToBeMated', mateIn: -1 }), candidate({ moveSan: 'other' })];

    // bestMoveChance 0 and a roll of 0.5 should miss (0.5 is not < 0), so
    // the pick falls through to the personality-weighted branch rather than
    // being forced onto the losing top candidate by mateConversionChance.
    const picked = pickBotMove({
      candidates,
      personality: NEUTRAL_PERSONALITY,
      bestMoveChance: 0,
      mateConversionChance: 0.9,
      random: () => 0.5
    });

    expect(picked.moveSan).not.toBe('aboutToBeMated');
  });

  test('high trapSeeking makes a fork-creating candidate reachable at a random() value a neutral personality would miss', () => {
    const candidates = [candidate({ moveSan: 'forks', createsFork: true }), candidate({ moveSan: 'quiet' })];
    const highTrapSeeking: BotPersonality = { ...NEUTRAL_PERSONALITY, trapSeeking: 100 };

    // Two calls: bestMoveChance roll (miss), then the weighted draw. Pick a
    // draw value that lands past the neutral-personality "quiet" candidate's
    // small floor-only share but within "forks"'s much larger trapSeeking-
    // boosted share.
    const random = (() => {
      const rolls = [0.999999, 0.2];
      let call = 0;
      return () => rolls[call++] ?? 0.999999;
    })();

    const picked = pickBotMove({ candidates, personality: highTrapSeeking, bestMoveChance: 0, mateConversionChance: 0, random });

    expect(picked.moveSan).toBe('forks');
  });

  test('with neutral personality, a low random() draw picks the first candidate', () => {
    const candidates = [candidate({ moveSan: 'a' }), candidate({ moveSan: 'b' }), candidate({ moveSan: 'c' })];
    const rolls = [0.999999, 0];
    let call = 0;
    const random = () => rolls[call++] ?? 0.999999;

    const picked = pickBotMove({ candidates, personality: NEUTRAL_PERSONALITY, bestMoveChance: 0, mateConversionChance: 0, random });

    expect(picked.moveSan).toBe('a');
  });
});
