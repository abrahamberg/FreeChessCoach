import { describe, expect, test } from 'vitest';
import { buildDiagnosticProfile, type PreviousProfileEntry } from './build-profile.js';
import type { DiagnosticEntry } from './diagnostic-entry.js';

function entry(overrides: Partial<DiagnosticEntry> = {}): DiagnosticEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    gameId: 'g1',
    failed: true,
    hwdl: 0.1,
    severity: 'meaningful',
    reachability: 0.6,
    opening: 'B01',
    userColor: 'white',
    phase: 'middlegame',
    clockRemainingMs: 60000,
    complexity: 1,
    opponentRating: 1200,
    playedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides
  };
}

/** Two failed opportunities in two different games — clears the
 * `'signal'` confidence bar (>= 2 episodes across >= 2 games), which is
 * the "above threshold" every history-status test below needs. */
function signalEntries(): DiagnosticEntry[] {
  return [entry({ gameId: 'g1' }), entry({ gameId: 'g2' })];
}

describe('buildDiagnosticProfile', () => {
  test('an empty window yields no diagnoses', () => {
    expect(buildDiagnosticProfile({ entries: [], studentRating: 1200 })).toEqual([]);
  });

  test('a single opportunity reads Insufficient confidence', () => {
    const [profile] = buildDiagnosticProfile({ entries: [entry()], studentRating: 1200 });
    expect(profile!.confidence).toBe('insufficient');
  });

  test('O, E, and E/O are counted correctly', () => {
    const entries = [entry({ gameId: 'g1', failed: true }), entry({ gameId: 'g2', failed: false }), entry({ gameId: 'g3', failed: true })];
    const [profile] = buildDiagnosticProfile({ entries, studentRating: 1200 });

    expect(profile!.opportunities).toBe(3);
    expect(profile!.episodes).toBe(2);
    expect(profile!.failureRate).toBeCloseTo(2 / 3, 5);
  });

  test('a code above threshold in two consecutive windows reads Persistent', () => {
    const previousProfile: PreviousProfileEntry[] = [{ code: 'TA-07', direction: 'D', historyStatus: 'newly_observed', aboveThreshold: true }];

    const [profile] = buildDiagnosticProfile({ entries: signalEntries(), studentRating: 1200, previousProfile });

    expect(profile!.confidence).not.toBe('insufficient');
    expect(profile!.historyStatus).toBe('persistent');
  });

  test('a resolved code that reappears above threshold reads Regressed', () => {
    const previousProfile: PreviousProfileEntry[] = [{ code: 'TA-07', direction: 'D', historyStatus: 'resolved', aboveThreshold: false }];

    const [profile] = buildDiagnosticProfile({ entries: signalEntries(), studentRating: 1200, previousProfile });

    expect(profile!.historyStatus).toBe('regressed');
  });

  test('a code that drops below threshold after being above it reads Monitoring, not Resolved', () => {
    const previousProfile: PreviousProfileEntry[] = [{ code: 'TA-07', direction: 'D', historyStatus: 'newly_observed', aboveThreshold: true }];

    const [profile] = buildDiagnosticProfile({ entries: [entry({ failed: false })], studentRating: 1200, previousProfile });

    expect(profile!.historyStatus).toBe('monitoring');
  });

  test('a second consecutive clean window turns Monitoring into Resolved', () => {
    const previousProfile: PreviousProfileEntry[] = [{ code: 'TA-07', direction: 'D', historyStatus: 'monitoring', aboveThreshold: false }];

    const [profile] = buildDiagnosticProfile({ entries: [entry({ failed: false })], studentRating: 1200, previousProfile });

    expect(profile!.historyStatus).toBe('resolved');
  });

  test('a code with no prior record reads Newly observed regardless of this window', () => {
    const [profile] = buildDiagnosticProfile({ entries: signalEntries(), studentRating: 1200 });
    expect(profile!.historyStatus).toBe('newly_observed');
  });

  test('an intact opposite-direction control skill is reported', () => {
    const entries = [
      ...signalEntries(),
      entry({ code: 'TA-07', direction: 'O', gameId: 'g3', failed: false }),
      entry({ code: 'TA-07', direction: 'O', gameId: 'g4', failed: false })
    ];

    const profile = buildDiagnosticProfile({ entries, studentRating: 1200 }).find((p) => p.direction === 'D');

    expect(profile!.controlSkill).toEqual({ code: 'TA-07', direction: 'O', failureRate: 0 });
  });

  test('no control skill is reported when the opposite direction is also unhealthy', () => {
    const entries = [
      ...signalEntries(),
      entry({ code: 'TA-07', direction: 'O', gameId: 'g3', failed: true }),
      entry({ code: 'TA-07', direction: 'O', gameId: 'g4', failed: true })
    ];

    const profile = buildDiagnosticProfile({ entries, studentRating: 1200 }).find((p) => p.direction === 'D');

    expect(profile!.controlSkill).toBeNull();
  });

  test('totalHwdl and severityMix are summed only over failed opportunities', () => {
    const entries = [
      entry({ gameId: 'g1', failed: true, hwdl: 0.3, severity: 'major' }),
      entry({ gameId: 'g2', failed: true, hwdl: 0.1, severity: 'minor' }),
      entry({ gameId: 'g3', failed: false, hwdl: 0.9, severity: 'decisive' })
    ];
    const [profile] = buildDiagnosticProfile({ entries, studentRating: 1200 });

    expect(profile!.totalHwdl).toBeCloseTo(0.4, 5);
    expect(profile!.severityMix).toEqual({ minor: 1, meaningful: 0, major: 1, decisive: 0 });
  });

  test('posteriorMean and credibleInterval are finite for a fresh code', () => {
    const [profile] = buildDiagnosticProfile({ entries: [entry()], studentRating: 1200 });

    expect(Number.isFinite(profile!.posteriorMean)).toBe(true);
    expect(Number.isFinite(profile!.credibleInterval[0])).toBe(true);
    expect(Number.isFinite(profile!.credibleInterval[1])).toBe(true);
  });
});
