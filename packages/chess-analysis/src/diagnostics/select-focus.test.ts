import { describe, expect, test } from 'vitest';
import { selectFocus, type FocusCandidate } from './select-focus.js';
import type { DiagnosticProfileEntry } from './build-profile.js';
import type { FiredGate } from './evaluate-gates.js';

function profile(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    opportunities: 10,
    episodes: 5,
    failureRate: 0.5,
    posteriorMean: 0.5,
    credibleInterval: [0.3, 0.7],
    confidence: 'probable',
    spread: { games: 4, sessions: 3, openings: 3, sides: 2 },
    totalHwdl: 1.5,
    severityMix: { minor: 1, meaningful: 2, major: 2, decisive: 0 },
    meanReachability: 0.7,
    scopeTags: ['general'],
    controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0.1 },
    historyStatus: 'newly_observed',
    ...overrides
  };
}

function candidate(profileOverrides: Partial<DiagnosticProfileEntry> = {}, firedGates: readonly FiredGate[] = []): FocusCandidate {
  return { profile: profile(profileOverrides), firedGates };
}

describe('selectFocus', () => {
  test('no candidates yields no primary and no differentials', () => {
    const selection = selectFocus({ candidates: [] });
    expect(selection).toEqual({ primary: null, secondary: [], controlSkill: null, differentials: [] });
  });

  test('a high-rate but engine-only code is filtered by the human-reachability override', () => {
    const reachable = candidate({ code: 'MS-01', direction: 'D' });
    const engineOnly = candidate({ code: 'BV-01', direction: 'D', meanReachability: 0.1, failureRate: 0.9, episodes: 9 });

    const selection = selectFocus({ candidates: [reachable, engineOnly] });

    expect(selection.primary!.code).toBe('MS-01');
    const ruledOut = selection.differentials.find((d) => d.code === 'BV-01');
    expect(ruledOut?.reason).toMatch(/not human-reachable/);
  });

  test('a downstream symptom loses to its upstream cause via the root-cause override', () => {
    const upstream = candidate({ code: 'BV-01', direction: 'D', confidence: 'signal', episodes: 2, spread: { games: 2, sessions: 2, openings: 2, sides: 2 } });
    const downstream = candidate({ code: 'TA-07', direction: 'D', confidence: 'probable', episodes: 9, totalHwdl: 3 });

    const selection = selectFocus({ candidates: [upstream, downstream] });

    expect(selection.primary!.code).toBe('BV-01');
    expect(selection.secondary).toEqual([]);
    const ruledOut = selection.differentials.find((d) => d.code === 'TA-07');
    expect(ruledOut?.reason).toMatch(/upstream/);
    expect(ruledOut?.reason).toMatch(/BV-01/);
  });

  test('unrelated content-domain families are not filtered against each other by the root-cause override', () => {
    const eg = candidate({ code: 'EG-01', direction: 'N', confidence: 'signal' });
    const pw = candidate({ code: 'PW-01', direction: 'N', confidence: 'signal' });

    const selection = selectFocus({ candidates: [eg, pw] });

    expect(selection.differentials).toEqual([]);
    expect([selection.primary?.code, ...selection.secondary.map((s) => s.code)]).toEqual(expect.arrayContaining(['EG-01', 'PW-01']));
  });

  test('a code behind a failed blocking gate can never be primary', () => {
    const gated = candidate({ code: 'TA-07', direction: 'D' }, [{ code: 'DQ-02', evidence: 'only 3 opportunities' }]);

    const selection = selectFocus({ candidates: [gated] });

    expect(selection.primary).toBeNull();
    expect(selection.differentials).toEqual([{ code: 'TA-07', direction: 'D', reason: expect.stringContaining('DQ-02') }]);
  });

  test('insufficient confidence never becomes primary or secondary', () => {
    const weak = candidate({ code: 'TA-07', direction: 'D', confidence: 'insufficient' });

    const selection = selectFocus({ candidates: [weak] });

    expect(selection.primary).toBeNull();
  });

  test('at most two secondary findings are returned even with more eligible candidates', () => {
    const candidates = [
      candidate({ code: 'EG-01', direction: 'N', totalHwdl: 4 }),
      candidate({ code: 'EG-02', direction: 'N', totalHwdl: 3 }),
      candidate({ code: 'EG-03', direction: 'N', totalHwdl: 2 }),
      candidate({ code: 'EG-04', direction: 'N', totalHwdl: 1 })
    ];

    const selection = selectFocus({ candidates });

    expect(selection.secondary.length).toBeLessThanOrEqual(2);
    expect(selection.differentials.length).toBe(1);
  });

  test('controlSkill mirrors the primary finding own control skill', () => {
    const withControl = candidate({ code: 'TA-07', direction: 'D', controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0 } });

    const selection = selectFocus({ candidates: [withControl] });

    expect(selection.controlSkill).toEqual({ code: 'TA-07', direction: 'O', failureRate: 0 });
  });

  test('a curriculum-only-gap code is outranked by a more frequent game leak (curriculum-value override)', () => {
    const gameLeak = candidate({ code: 'CA-01', direction: 'N', episodes: 8 });
    const curriculumOnly = candidate({ code: 'CA-22', direction: 'N', episodes: 3, confidence: 'signal' });

    const selection = selectFocus({ candidates: [gameLeak, curriculumOnly] });

    expect(selection.primary!.code).toBe('CA-01');
    const ruledOut = selection.differentials.find((d) => d.code === 'CA-22');
    expect(ruledOut?.reason).toMatch(/curriculum-only/);
  });

  test('a clock-bound finding is explained away by an intact performance-state override', () => {
    const state = candidate({ code: 'PS-01', direction: 'N', confidence: 'signal', episodes: 2, scopeTags: ['general'] });
    const clockBound = candidate({ code: 'EG-01', direction: 'N', scopeTags: ['clock_bound'] });

    const selection = selectFocus({ candidates: [state, clockBound] });

    expect(selection.primary!.code).toBe('PS-01');
    const ruledOut = selection.differentials.find((d) => d.code === 'EG-01');
    expect(ruledOut?.reason).toMatch(/state override/);
  });
});
