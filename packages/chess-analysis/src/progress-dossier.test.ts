import { describe, expect, test } from 'vitest';
import { habitResults, hasComeBack, type DossierGame, type DossierObservation } from './progress-dossier.js';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
// Newest first, as the service lists them.
const games: DossierGame[] = [
  { gameId: 'g3', playedAt: day(3), isNew: true },
  { gameId: 'g2', playedAt: day(2), isNew: false },
  { gameId: 'g1', playedAt: day(1), isNew: false }
];
const obs = (gameId: string, code: string, failed: boolean): DossierObservation => ({ gameId, code, failed });

describe('habitResults', () => {
  test('one result per recent game, oldest first, and a game with no chance is not a success', () => {
    const observations = [obs('g1', 'BV-04', true), obs('g1', 'BV-04', false), obs('g3', 'BV-04', false), obs('g3', 'BV-02', true)];

    expect(habitResults('BV-04', games, observations)).toEqual([
      { gameId: 'g1', isNew: false, opportunities: 2, failures: 1 },
      { gameId: 'g2', isNew: false, opportunities: 0, failures: 0 },
      { gameId: 'g3', isNew: true, opportunities: 1, failures: 0 }
    ]);
  });

  test('only the newest games are kept', () => {
    expect(habitResults('BV-04', games, [], 2).map((result) => result.gameId)).toEqual(['g2', 'g3']);
  });
});

describe('hasComeBack', () => {
  test('a failure in a game played after the graduation date, of that code only', () => {
    const observations = [obs('g1', 'BV-04', true), obs('g3', 'BV-02', true)];
    expect(hasComeBack('BV-04', day(2), games, observations)).toBe(false);

    expect(hasComeBack('BV-04', day(2), games, [...observations, obs('g3', 'BV-04', true)])).toBe(true);
    expect(hasComeBack('BV-04', day(2), games, [...observations, obs('g3', 'BV-04', false)])).toBe(false);
  });
});
