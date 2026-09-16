import { describe, expect, test } from 'vitest';
import type { BotPersonality } from '@freechesscoach/shared';
import type { BotCandidate } from './bot-candidate-weighting.js';
import { pickBlunder, pickTacticalMistake } from './bot-mistake-pool.js';

const NEUTRAL_PERSONALITY: BotPersonality = { aggression: 0, trapSeeking: 0, defensiveness: 0 };
// No checks/captures/threats for white, and none of these placeholder SANs
// resolve to a real move from here (defensiveExposure degrades to 0 for an
// unparseable SAN — see bot-mistake-pool.ts's fenAfterMove) — every
// candidate below ties on TTC priority, so pool ranking here reduces to
// stable original-array order, keeping these tests deterministic without
// needing real tactical FENs.
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

describe('pickTacticalMistake', () => {
  test('prefers a candidate matching a documented diagnosis code over a higher-scoring one that does not', () => {
    const candidates = [candidate('best', { cp: 10 }), candidate('flawed', { cp: -5, diagnosisCodes: ['BV-01'] })];
    const picked = pickTacticalMistake(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, ['BV-01'], () => 0);
    expect(picked.moveSan).toBe('flawed');
  });

  test('never picks a candidate that doesn\'t actually lose enough cp from the engine\'s best move to count as a real mistake', () => {
    // candidates[0] ('best', cp 0) is the engine baseline. 'fine' only
    // loses 20cp from it — well under TACTICAL_MISTAKE_MIN_CP_LOSS — so
    // it's excluded even though it's the only other TTC-plausible option
    // besides the real mistake.
    const candidates = [candidate('best', { cp: 0 }), candidate('fine', { cp: -20 }), candidate('mistake', { cp: -100 })];
    const picked = pickTacticalMistake(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, ['BV-01'], () => 0);
    expect(picked.moveSan).toBe('mistake');
  });

  test('an undocumented code on a candidate never counts as a match, even when that candidate is the only real mistake available', () => {
    const candidates = [candidate('best', { cp: 0 }), candidate('other', { cp: -100, diagnosisCodes: ['TA-07'] })];
    const picked = pickTacticalMistake(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, ['TA-14'], () => 0);
    expect(picked.moveSan).toBe('other');
  });

  test('caps the ranked pool at 10 and samples down to 5 before picking, never reaching a candidate ranked past 10th', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => candidate(`m${i}`, { cp: -i }));
    // random() 0 always draws the first remaining candidate in
    // sampleTtcPool's sampling loop, so with every candidate tying on TTC
    // priority (stable original order), the sample is exactly m0..m4. None
    // of them loses anywhere near enough cp from m0 (candidates[0], the
    // baseline) to count as a real mistake — the largest loss in the
    // sample is m4's 4cp — so this falls back to the sample's own
    // worst-scoring candidate (m4), never reaching m5..m11's larger losses
    // past the pool cap.
    const picked = pickTacticalMistake(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, [], () => 0);
    expect(picked.moveSan).toBe('m4');
  });

  test('among several real mistakes with no diagnosis match, prefers the mildest one rather than the harshest', () => {
    // Both 'mild' (loss 90) and 'severe' (loss 400) clear the mistake
    // floor, but a tactical mistake should read as a real slip, not the
    // worst possible move available (that's pickBlunder's job) — the
    // mildest qualifying candidate wins.
    const candidates = [candidate('best', { cp: 0 }), candidate('mild', { cp: -90 }), candidate('severe', { cp: -400 })];
    const picked = pickTacticalMistake(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, ['BV-01'], () => 0);
    expect(picked.moveSan).toBe('mild');
  });
});

describe('pickBlunder', () => {
  test('picks the sample\'s worst-scoring candidate', () => {
    const candidates = [candidate('better', { cp: 10 }), candidate('worse', { cp: -20 })];
    const picked = pickBlunder(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, () => 0);
    expect(picked.moveSan).toBe('worse');
  });

  test('a live mate for the opponent (negative mateIn) always outranks a merely bad cp as the worst pick', () => {
    const candidates = [candidate('badCp', { cp: -900 }), candidate('gettingMated', { mateIn: -1 })];
    const picked = pickBlunder(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, () => 0);
    expect(picked.moveSan).toBe('gettingMated');
  });

  test('only ever picks from within the top-10-ranked, 5-sampled pool, not an arbitrarily bad low-ranked candidate', () => {
    // m11 (cp -11) is the single worst-scoring candidate overall, but it
    // ranks 12th (past the pool's top-10 cap) under the tie-stable original
    // order — pickBlunder must not reach past the pool to find it.
    const candidates = Array.from({ length: 12 }, (_, i) => candidate(`m${i}`, { cp: -i }));
    const picked = pickBlunder(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, () => 0);
    expect(picked.moveSan).not.toBe('m11');
    expect(picked.moveSan).toBe('m4');
  });

  test('prefers a candidate that actually clears the real-blunder cp floor over a merely-mediocre worst-of-sample', () => {
    // 'mediocre' is the worst-scoring of the two by cp, but only loses 30cp
    // from 'best' (candidates[0]) — nowhere near BLUNDER_MIN_CP_LOSS.
    // 'blunder' clears the floor outright and must win instead.
    const candidates = [candidate('best', { cp: 0 }), candidate('mediocre', { cp: -30 }), candidate('blunder', { cp: -300 })];
    const picked = pickBlunder(candidates, NEUTRAL_FEN, NEUTRAL_PERSONALITY, () => 0);
    expect(picked.moveSan).toBe('blunder');
  });
});
