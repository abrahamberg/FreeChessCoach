import { TACTIC_MOTIF_TYPES, type TacticMotifCounts, type TacticMotifType } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { CONFIG } from './config.js';
import { pickCoachingCandidate, tacticalPointsOf, type CoachingCandidateGame } from './coaching-candidate.js';

type MotifRow = { opportunities: number; found: number; preventable?: number; prevented?: number };

function motifs(overrides: Partial<Record<TacticMotifType, MotifRow>> = {}): TacticMotifCounts {
  const base = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
  return { ...base, ...overrides } as TacticMotifCounts;
}

function game(gameId: string, overrides: Partial<Record<TacticMotifType, MotifRow>>, playedAt: string | null = '2026-03-01T00:00:00Z'): CoachingCandidateGame {
  return { gameId, tacticMotifs: motifs(overrides), playedAt: playedAt === null ? null : new Date(playedAt) };
}

describe('tacticalPointsOf', () => {
  test('a game with no tactics is worth nothing', () => {
    expect(tacticalPointsOf(motifs())).toBe(0);
  });

  test('every missed tactic (opportunity not found) is a point', () => {
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 4, found: 1 }, pin: { opportunities: 2, found: 0 } }))).toBe(5);
  });

  test('every tactic the opponent had that the player did not defuse is a point', () => {
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 0, found: 0, preventable: 3, prevented: 1 } }))).toBe(2);
  });

  test('missed and allowed tactics add up', () => {
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 3, found: 1, preventable: 2, prevented: 0 } }))).toBe(4);
  });

  test('absent preventable/prevented (an old report) contribute 0 — never NaN, never negative', () => {
    const points = tacticalPointsOf(motifs({ fork: { opportunities: 2, found: 2 }, pin: { opportunities: 1, found: 0 } }));
    expect(points).toBe(1);
    expect(Number.isNaN(points)).toBe(false);
  });

  test('prevented without preventable, or more prevented than preventable, never goes negative', () => {
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 0, found: 0, prevented: 2 } }))).toBe(0);
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 0, found: 0, preventable: 1, prevented: 3 } }))).toBe(0);
  });

  test('found above opportunities never subtracts', () => {
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 1, found: 3 } }))).toBe(0);
  });

  test('the weights come from CONFIG', () => {
    const weighted = CONFIG.coachingCandidate.missedTacticWeight * 2 + CONFIG.coachingCandidate.allowedTacticWeight * 3;
    expect(tacticalPointsOf(motifs({ fork: { opportunities: 2, found: 0, preventable: 3, prevented: 0 } }))).toBe(weighted);
  });
});

describe('pickCoachingCandidate', () => {
  test('an empty list has no candidate', () => {
    expect(pickCoachingCandidate([])).toBeNull();
  });

  test('picks the game with the most tactical points', () => {
    const pick = pickCoachingCandidate([
      game('a', { fork: { opportunities: 1, found: 0 } }),
      game('b', { fork: { opportunities: 5, found: 1 } }),
      game('c', { fork: { opportunities: 2, found: 0 } })
    ]);

    expect(pick?.gameId).toBe('b');
    expect(pick?.points).toBe(4);
  });

  test('ties go to the most recently played game', () => {
    const tied = { fork: { opportunities: 2, found: 0 } };
    const pick = pickCoachingCandidate([
      game('older', tied, '2026-03-01T00:00:00Z'),
      game('newer', tied, '2026-03-05T00:00:00Z'),
      game('unknown-date', tied, null)
    ]);

    expect(pick?.gameId).toBe('newer');
  });

  test('a remaining tie goes to the lowest game id, so the pick is deterministic', () => {
    const tied = { fork: { opportunities: 2, found: 0 } };
    const games = [game('b', tied), game('a', tied), game('c', tied)];

    expect(pickCoachingCandidate(games)?.gameId).toBe('a');
    expect(pickCoachingCandidate([...games].reverse())?.gameId).toBe('a');
  });

  test('a game with no points is still returned when nothing scores higher', () => {
    const pick = pickCoachingCandidate([game('quiet', {})]);
    expect(pick).toEqual({ gameId: 'quiet', points: 0, topMotifs: [] });
  });

  test('says why: the top motifs by points, with missed and allowed counts', () => {
    const pick = pickCoachingCandidate([
      game('a', {
        fork: { opportunities: 3, found: 0 },
        pin: { opportunities: 2, found: 0, preventable: 1, prevented: 0 },
        skewer: { opportunities: 1, found: 0 },
        discoveredAttack: { opportunities: 1, found: 0 },
        checkmate: { opportunities: 1, found: 1 }
      })
    ]);

    expect(pick?.topMotifs).toHaveLength(CONFIG.coachingCandidate.topMotifCount);
    expect(pick?.topMotifs[0]).toEqual({ motif: 'fork', missed: 3, allowed: 0 });
    expect(pick?.topMotifs[1]).toEqual({ motif: 'pin', missed: 2, allowed: 1 });
    expect(pick?.topMotifs.map((row) => row.motif)).not.toContain('checkmate');
  });
});
