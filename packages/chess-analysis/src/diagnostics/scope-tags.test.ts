import { describe, expect, test } from 'vitest';
import { deriveSessions, detectScopeTags } from './scope-tags.js';
import type { DiagnosticEntry } from './diagnostic-entry.js';

function entry(overrides: Partial<DiagnosticEntry> = {}): DiagnosticEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    gameId: 'g1',
    failed: false,
    hwdl: 0,
    severity: 'minor',
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

describe('detectScopeTags', () => {
  test('a uniform sample with no standout subgroup reads general', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ gameId: `g${i}`, opening: `opening-${i}`, failed: i % 2 === 0 })
    );

    expect(detectScopeTags(entries)).toEqual(['general']);
  });

  test('failures concentrated in one opening are tagged opening-bound', () => {
    const failing = Array.from({ length: 6 }, (_, i) => entry({ gameId: `f${i}`, opening: 'B01', failed: true }));
    const healthy = Array.from({ length: 6 }, (_, i) => entry({ gameId: `h${i}`, opening: `other-${i}`, failed: false }));

    expect(detectScopeTags([...failing, ...healthy])).toContain('opening_bound');
  });

  test('failures concentrated on one side are tagged side/color-bound', () => {
    const failing = Array.from({ length: 6 }, (_, i) => entry({ gameId: `f${i}`, userColor: 'black', failed: true }));
    const healthy = Array.from({ length: 6 }, (_, i) => entry({ gameId: `h${i}`, userColor: 'white', failed: false }));

    expect(detectScopeTags([...failing, ...healthy])).toContain('side_color_bound');
  });

  test('failures concentrated at low clock are tagged clock-bound', () => {
    const failing = Array.from({ length: 6 }, (_, i) => entry({ gameId: `f${i}`, clockRemainingMs: 2000, failed: true }));
    const healthy = Array.from({ length: 6 }, (_, i) => entry({ gameId: `h${i}`, clockRemainingMs: 300000, failed: false }));

    expect(detectScopeTags([...failing, ...healthy])).toContain('clock_bound');
  });
});

describe('deriveSessions', () => {
  test('games played back-to-back share one session', () => {
    const entries = [
      entry({ gameId: 'g1', playedAt: new Date('2026-01-01T10:00:00Z') }),
      entry({ gameId: 'g2', playedAt: new Date('2026-01-01T10:15:00Z') })
    ];

    const sessions = deriveSessions(entries);
    expect(sessions.get('g1')).toBe(sessions.get('g2'));
  });

  test('games separated by a large gap fall into different sessions', () => {
    const entries = [
      entry({ gameId: 'g1', playedAt: new Date('2026-01-01T10:00:00Z') }),
      entry({ gameId: 'g2', playedAt: new Date('2026-01-02T10:00:00Z') })
    ];

    const sessions = deriveSessions(entries);
    expect(sessions.get('g1')).not.toBe(sessions.get('g2'));
  });
});
