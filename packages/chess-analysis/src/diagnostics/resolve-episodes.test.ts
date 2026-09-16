import type { DiagnosisCodeId, Direction } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import type { DiagnosticObservation } from './types.js';
import { isCompletelyDecidedPosition, resolveEpisodes, type EpisodePly } from './resolve-episodes.js';

function observation(code: DiagnosisCodeId, ply: number, overrides: Partial<DiagnosticObservation> = {}): DiagnosticObservation {
  const direction: Direction = overrides.direction ?? 'O';
  return {
    code,
    direction,
    ply,
    failed: true,
    hwdl: 0.2,
    severity: 'major',
    reachability: 0.8,
    detail: `${code} at ply ${ply}`,
    ...overrides
  };
}

describe('isCompletelyDecidedPosition', () => {
  test('true when both readings are trivially won', () => {
    expect(isCompletelyDecidedPosition(95, 91)).toBe(true);
  });

  test('true when both readings are completely lost', () => {
    expect(isCompletelyDecidedPosition(8, 2)).toBe(true);
  });

  test('false for a normal, undecided position', () => {
    expect(isCompletelyDecidedPosition(60, 45)).toBe(false);
  });

  test('false when only one side of the move is at the extreme', () => {
    expect(isCompletelyDecidedPosition(95, 50)).toBe(false);
  });
});

describe('resolveEpisodes', () => {
  test('a single-ply incident with no cascade yields one episode spanning that ply', () => {
    const plies: EpisodePly[] = [
      { ply: 10, winPctBefore: 70, winPctAfter: 40, observations: [observation('MS-08', 10)] },
      { ply: 12, winPctBefore: 45, winPctAfter: 75, observations: [] }
    ];

    const episodes = resolveEpisodes(plies);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.primary.code).toBe('MS-08');
    expect(episodes[0]!.plies).toEqual([10]);
  });

  test('a five-ply collapse after one hang yields exactly one episode', () => {
    const hang = observation('BV-01', 10, { hwdl: 0.4, severity: 'decisive' });
    const plies: EpisodePly[] = [
      { ply: 10, winPctBefore: 70, winPctAfter: 20, observations: [hang] },
      { ply: 12, winPctBefore: 20, winPctAfter: 18, observations: [] },
      { ply: 14, winPctBefore: 18, winPctAfter: 15, observations: [] },
      { ply: 16, winPctBefore: 15, winPctAfter: 12, observations: [] },
      { ply: 18, winPctBefore: 12, winPctAfter: 10, observations: [] },
      // Win% finally climbs back above the pre-hang baseline (70) — a
      // later ply's own failure must NOT merge into the same episode.
      { ply: 20, winPctBefore: 10, winPctAfter: 75, observations: [] },
      { ply: 22, winPctBefore: 75, winPctAfter: 50, observations: [observation('MS-01', 22)] }
    ];

    const episodes = resolveEpisodes(plies);

    expect(episodes).toHaveLength(2);
    expect(episodes[0]!.primary.code).toBe('BV-01');
    expect(episodes[0]!.secondary).toEqual([]);
    expect(episodes[0]!.plies).toEqual([10, 12, 14, 16, 18]);
    expect(episodes[1]!.primary.code).toBe('MS-01');
    expect(episodes[1]!.plies).toEqual([22]);
  });

  test('a knight-geometry failure and a knight-fork miss on the same ply yield BV-06 primary with TA-07 secondary', () => {
    // §I.3's own worked example: a board-vision (knight-geometry) failure
    // upstream of the tactical-recognition (knight-fork) failure it causes
    // — one incident, not two independent weaknesses.
    const plies: EpisodePly[] = [
      {
        ply: 14,
        winPctBefore: 65,
        winPctAfter: 30,
        observations: [observation('TA-07', 14), observation('BV-06', 14)]
      }
    ];

    const episodes = resolveEpisodes(plies);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.primary.code).toBe('BV-06');
    expect(episodes[0]!.secondary.map((o) => o.code)).toEqual(['TA-07']);
  });

  test('DQ-09: observations inside a completely lost position are dropped entirely, forming no episode', () => {
    const plies: EpisodePly[] = [{ ply: 30, winPctBefore: 8, winPctAfter: 3, observations: [observation('MS-02', 30)] }];

    expect(resolveEpisodes(plies)).toEqual([]);
  });

  test('DQ-09: observations inside a trivially won position are likewise dropped', () => {
    const plies: EpisodePly[] = [{ ply: 30, winPctBefore: 96, winPctAfter: 92, observations: [observation('MS-02', 30)] }];

    expect(resolveEpisodes(plies)).toEqual([]);
  });

  test('an unfailed observation never starts or extends an episode', () => {
    const plies: EpisodePly[] = [{ ply: 10, winPctBefore: 60, winPctAfter: 55, observations: [observation('MS-04', 10, { failed: false })] }];

    expect(resolveEpisodes(plies)).toEqual([]);
  });

  test('a still-open episode at the end of the input is still returned', () => {
    const plies: EpisodePly[] = [{ ply: 40, winPctBefore: 70, winPctAfter: 20, observations: [observation('BV-01', 40)] }];

    const episodes = resolveEpisodes(plies);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.plies).toEqual([40]);
  });
});
