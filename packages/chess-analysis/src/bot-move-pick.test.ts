import { describe, expect, test } from 'vitest';
import { pickBotMove, type BotCandidate, type PickBotMoveInput } from './bot-move-pick.js';
import type { BotPersonality } from '@freechesscoach/shared';

const NEUTRAL_PERSONALITY: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };
// Standard start: no checks/captures/threats, so 'opening'/'endgame' tests
// (which never consult the shortlist anyway) don't need to reason about it.
const NEUTRAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function candidate(overrides: Partial<BotCandidate> = {}): BotCandidate {
  return {
    moveSan: 'e4',
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
    bestMoveChance: 0,
    mateConversionChance: 0,
    diagnosisManifestChance: 0,
    diagnosisCodes: [],
    fenBefore: NEUTRAL_FEN,
    phase: 'opening',
    ...overrides
  };
}

describe('pickBotMove', () => {
  test('throws on an empty candidate list', () => {
    expect(() => pickBotMove(input({ candidates: [], random: () => 0 }))).toThrow();
  });

  test('bestMoveChance 1 always plays the engine top candidate, even when random() is near the boundary', () => {
    const candidates = [candidate({ moveSan: 'best' }), candidate({ moveSan: 'other' })];

    for (const randomValue of [0, 0.5, 0.999999]) {
      const picked = pickBotMove(input({ candidates, bestMoveChance: 1, mateConversionChance: 1, random: () => randomValue }));
      expect(picked.moveSan).toBe('best');
    }
  });

  test('bestMoveChance 0 with no mate and diagnosisManifestChance 0 always defers to the personality-weighted pick', () => {
    const candidates = [candidate({ moveSan: 'best' }), candidate({ moveSan: 'other' })];
    // random() sequence: bestMoveChance roll (miss), diagnosisManifestChance
    // roll (miss), then the weighted draw.
    const rolls = [0.999999, 0.999999, 0.999999];
    let call = 0;
    const random = () => rolls[call++] ?? 0.999999;

    const picked = pickBotMove(input({ candidates, random }));

    // With equal weights and random() near 1, the weighted draw lands on the last candidate.
    expect(picked.moveSan).toBe('other');
  });

  test('a mate-in candidate at the top uses mateConversionChance instead of a low bestMoveChance', () => {
    const candidates = [candidate({ moveSan: 'mate', mateIn: 1 }), candidate({ moveSan: 'other' })];

    const picked = pickBotMove(
      input({
        candidates,
        mateConversionChance: 0.9,
        // Below mateConversionChance (0.9) but would have missed bestMoveChance (0).
        random: () => 0.5
      })
    );

    expect(picked.moveSan).toBe('mate');
  });

  test('a negative (being-mated) mateIn on the top candidate does not trigger the mate-conversion floor', () => {
    const candidates = [candidate({ moveSan: 'aboutToBeMated', mateIn: -1 }), candidate({ moveSan: 'other' })];

    // bestMoveChance 0 and a roll of 0.5 should miss (0.5 is not < 0), so
    // the pick falls through past the mate floor.
    const picked = pickBotMove(input({ candidates, mateConversionChance: 0.9, random: () => 0.5 }));

    expect(picked.moveSan).not.toBe('aboutToBeMated');
  });

  test('high trapSeeking makes a fork-creating candidate reachable at a random() value a neutral personality would miss', () => {
    const candidates = [candidate({ moveSan: 'forks', createsFork: true }), candidate({ moveSan: 'quiet' })];
    const highTrapSeeking: BotPersonality = { ...NEUTRAL_PERSONALITY, trapSeeking: 100 };

    // Three calls: bestMoveChance roll (miss), diagnosisManifestChance roll
    // (miss), then the weighted draw. Pick a draw value that lands past the
    // neutral-personality "quiet" candidate's small floor-only share but
    // within "forks"'s much larger trapSeeking-boosted share.
    const rolls = [0.999999, 0.999999, 0.2];
    let call = 0;
    const random = () => rolls[call++] ?? 0.999999;

    const picked = pickBotMove(input({ candidates, personality: highTrapSeeking, random }));

    expect(picked.moveSan).toBe('forks');
  });

  test('with neutral personality, a low weighted-draw random() picks the first candidate', () => {
    const candidates = [candidate({ moveSan: 'a' }), candidate({ moveSan: 'b' }), candidate({ moveSan: 'c' })];
    const rolls = [0.999999, 0.999999, 0];
    let call = 0;
    const random = () => rolls[call++] ?? 0.999999;

    const picked = pickBotMove(input({ candidates, random }));

    expect(picked.moveSan).toBe('a');
  });

  describe('aggression rewards a real threat, not a self-blunder', () => {
    test('createsOpponentHangingPiece is what aggression weighs — a candidate with it is reachable a neutral floor-only draw would miss', () => {
      const candidates = [candidate({ moveSan: 'threatens', createsOpponentHangingPiece: true }), candidate({ moveSan: 'quiet' })];
      const highAggression: BotPersonality = { ...NEUTRAL_PERSONALITY, aggression: 100 };
      const rolls = [0.999999, 0.999999, 0.2];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(input({ candidates, personality: highAggression, random }));

      expect(picked.moveSan).toBe('threatens');
    });
  });

  describe('steering toward a documented diagnosis code', () => {
    test('diagnosisManifestChance hit picks a candidate matching the documented code over one that would otherwise win the weighted draw', () => {
      // 'other' would win an unfiltered draw at a high random() value (it's
      // last), but the manifest roll restricts sampling to 'blunder' alone.
      const candidates = [candidate({ moveSan: 'blunder', diagnosisCodes: ['BV-01'] }), candidate({ moveSan: 'other' })];
      const rolls = [0.999999, 0, 0.999999];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(
        input({ candidates, diagnosisManifestChance: 1, diagnosisCodes: ['BV-01'], random })
      );

      expect(picked.moveSan).toBe('blunder');
    });

    test('diagnosisManifestChance hit with no matching candidate falls through to the full pool instead of dead-ending', () => {
      const candidates = [candidate({ moveSan: 'a' }), candidate({ moveSan: 'b' })];
      const rolls = [0.999999, 0, 0.999999];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(
        input({ candidates, diagnosisManifestChance: 1, diagnosisCodes: ['BV-01'], random })
      );

      expect(picked.moveSan).toBe('b');
    });

    test('an undocumented code never steers, even when candidates carry other codes', () => {
      const candidates = [candidate({ moveSan: 'forks', diagnosisCodes: ['TA-07'] }), candidate({ moveSan: 'other' })];
      const rolls = [0.999999, 0, 0.999999];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(
        input({ candidates, diagnosisManifestChance: 1, diagnosisCodes: ['TA-14'], random })
      );

      expect(picked.moveSan).toBe('other');
    });
  });

  describe('middlegame plausible-move shortlist', () => {
    // White queen a1 can check via Qa7+ (file) or Qh8+ (long diagonal);
    // Kd1 is a quiet, non-forcing king move that is neither a check, a
    // capture, nor a reply to a threat.
    const SHORTLIST_FEN = 'k7/8/8/8/8/8/8/Q3K3 w - - 0 1';

    function shortlistCandidates(): BotCandidate[] {
      return [candidate({ moveSan: 'Qa7+' }), candidate({ moveSan: 'Qh8+' }), candidate({ moveSan: 'Kd1' })];
    }

    test('excludes a non-forcing candidate from the weighted draw in the middlegame', () => {
      const rolls = [0.999999, 0.999999, 0.999999];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(
        input({ candidates: shortlistCandidates(), fenBefore: SHORTLIST_FEN, phase: 'middlegame', random })
      );

      // The same roll sequence would land on 'Kd1' (last) in an unfiltered
      // 3-candidate draw — the shortlist must exclude it instead.
      expect(picked.moveSan).not.toBe('Kd1');
    });

    test('does not restrict the pool outside the middlegame', () => {
      const rolls = [0.999999, 0.999999, 0.999999];
      let call = 0;
      const random = () => rolls[call++] ?? 0.999999;

      const picked = pickBotMove(
        input({ candidates: shortlistCandidates(), fenBefore: SHORTLIST_FEN, phase: 'opening', random })
      );

      expect(picked.moveSan).toBe('Kd1');
    });
  });
});
