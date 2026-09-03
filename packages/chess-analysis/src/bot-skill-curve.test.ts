import { describe, expect, test } from 'vitest';
import { bestMoveChanceForElo, diagnosisManifestChanceForElo } from './bot-skill-curve.js';

const ANCHOR_TOLERANCE = 0.02;

describe('bestMoveChanceForElo', () => {
  test.each([
    [300, 0.05],
    [500, 0.6],
    [800, 0.8]
  ])('matches the given anchor at elo %i', (elo, expected) => {
    expect(bestMoveChanceForElo(elo, 'middlegame')).toBeCloseTo(expected, 1);
    expect(Math.abs(bestMoveChanceForElo(elo, 'middlegame') - expected)).toBeLessThanOrEqual(ANCHOR_TOLERANCE);
  });

  test('is monotonically non-decreasing in elo for a fixed phase', () => {
    const elos = Array.from({ length: 41 }, (_, i) => 300 + i * 50);
    const values = elos.map((elo) => bestMoveChanceForElo(elo, 'middlegame'));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
    }
  });

  test('endgame and opening are more competent than middlegame at the same elo, clamped below 1', () => {
    for (const elo of [300, 500, 800, 1500, 2300]) {
      const opening = bestMoveChanceForElo(elo, 'opening');
      const middlegame = bestMoveChanceForElo(elo, 'middlegame');
      const endgame = bestMoveChanceForElo(elo, 'endgame');
      expect(opening).toBeGreaterThanOrEqual(middlegame);
      expect(endgame).toBeGreaterThanOrEqual(opening);
      expect(endgame).toBeLessThanOrEqual(0.99);
    }
  });

  test('clamps outside the roster elo range instead of extrapolating', () => {
    expect(bestMoveChanceForElo(100, 'middlegame')).toBe(bestMoveChanceForElo(300, 'middlegame'));
    expect(bestMoveChanceForElo(9999, 'middlegame')).toBe(bestMoveChanceForElo(2300, 'middlegame'));
  });
});

describe('diagnosisManifestChanceForElo', () => {
  test.each([
    [300, 0.95],
    [800, 0.3],
    [1200, 0.02]
  ])('matches the given anchor at elo %i', (elo, expected) => {
    expect(Math.abs(diagnosisManifestChanceForElo(elo) - expected)).toBeLessThanOrEqual(ANCHOR_TOLERANCE);
  });

  test('is monotonically non-increasing in elo', () => {
    const elos = Array.from({ length: 41 }, (_, i) => 300 + i * 50);
    const values = elos.map((elo) => diagnosisManifestChanceForElo(elo));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]!);
    }
  });

  test('stays within [0, 1] across the full elo range', () => {
    for (const elo of [300, 500, 800, 1200, 1800, 2300]) {
      const value = diagnosisManifestChanceForElo(elo);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
