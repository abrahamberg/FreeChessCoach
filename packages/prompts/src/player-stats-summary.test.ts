import { describe, expect, test } from 'vitest';
import type { PlayerBaselineComparison } from '@freechesscoach/chess-analysis';
import { renderPlayerStats } from './player-stats-summary.js';

function baseComparison(overrides: Partial<PlayerBaselineComparison> = {}): PlayerBaselineComparison {
  return {
    baselineGames: 12,
    accuracy: { game: 68, baseline: 74 },
    scores: {
      opening: { game: 80, baseline: 78 },
      tactics: { game: 40, baseline: 62 },
      strategy: { game: 70, baseline: 71 },
      endgame: { game: null, baseline: 55 }
    },
    blundersPerGame: { game: 2, baseline: 0.8 },
    mistakesPerGame: { game: 1, baseline: 1.4 },
    missesPerGame: { game: 3, baseline: 1.2 },
    tactics: [{ motif: 'fork', gameFound: 0, gameOpportunities: 2, baselineFound: 7, baselineOpportunities: 14 }],
    ...overrides
  };
}

describe('renderPlayerStats', () => {
  test('states how many games the baseline is drawn from', () => {
    const text = renderPlayerStats({ comparison: baseComparison(), baselineLabel: 'rapid games' });

    expect(text).toContain('Baseline: 12 rapid games (this game excluded)');
  });

  test('every figure is shown as this game against their usual, never alone', () => {
    const text = renderPlayerStats({ comparison: baseComparison(), baselineLabel: 'rapid games' });

    expect(text).toContain('Accuracy: 68.0 this game vs 74.0 usual');
    expect(text).toContain('- Tactics: 40 this game vs 62 usual');
  });

  test('a score this game has no figure for reads as not measured, never as zero', () => {
    const text = renderPlayerStats({ comparison: baseComparison(), baselineLabel: 'rapid games' });

    expect(text).toContain('- Endgame: not measured this game vs 55 usual');
  });

  test('the standout line names the widest real gap, so the coach has somewhere to start', () => {
    const text = renderPlayerStats({ comparison: baseComparison(), baselineLabel: 'rapid games' });

    expect(text).toContain('Out of line this game: Tactics well below their usual (-22)');
  });

  test('a typical game says so instead of inventing a standout', () => {
    const typical = baseComparison({
      scores: {
        opening: { game: 80, baseline: 78 },
        tactics: { game: 61, baseline: 62 },
        strategy: { game: 70, baseline: 71 },
        endgame: { game: null, baseline: 55 }
      }
    });
    const text = renderPlayerStats({ comparison: typical, baselineLabel: 'rapid games' });

    expect(text).toContain('Out of line this game: nothing');
    expect(text).toContain('trust the standing focus areas');
  });

  test('tactic rates are shown as found-out-of-available for both this game and the baseline', () => {
    const text = renderPlayerStats({ comparison: baseComparison(), baselineLabel: 'rapid games' });

    expect(text).toContain('Forks: 0/2 this game, 7/14 across the baseline');
  });

  test('with no baseline the coach is told to treat the game as a first data point', () => {
    const text = renderPlayerStats({
      comparison: baseComparison({ baselineGames: 0, accuracy: { game: 68, baseline: null } }),
      baselineLabel: 'rapid games'
    });

    expect(text).toContain('No baseline yet');
  });

  test('with neither a baseline nor a game report it says so and points at the other evidence', () => {
    const text = renderPlayerStats({
      comparison: baseComparison({ baselineGames: 0, accuracy: { game: null, baseline: null } }),
      baselineLabel: 'rapid games'
    });

    expect(text).toContain('nothing to compare');
    expect(text).toContain('get_diagnostic_profile');
  });

  test('a live game with no report of its own says so instead of claiming a comparison', () => {
    const text = renderPlayerStats({
      comparison: baseComparison({
        accuracy: { game: null, baseline: 74 },
        scores: {
          opening: { game: null, baseline: 78 },
          tactics: { game: null, baseline: 62 },
          strategy: { game: null, baseline: 71 },
          endgame: { game: null, baseline: 55 }
        }
      }),
      baselineLabel: 'rapid games'
    });

    expect(text).toContain('This game has no report of its own');
    expect(text).not.toContain('Out of line this game');
  });
});
