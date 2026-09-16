import { TACTIC_MOTIF_TYPES, type PlayerReport, type TacticMotifType } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { comparePlayerBaseline } from './compare-player-baseline.js';

function zeroTacticMotifs(
  overrides: Partial<Record<TacticMotifType, { opportunities: number; found: number }>> = {}
): PlayerReport['tacticMotifs'] {
  const base = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
  return { ...base, ...overrides } as PlayerReport['tacticMotifs'];
}

function buildPlayerReport(overrides: Partial<PlayerReport> = {}): PlayerReport {
  const zeroCounts = Object.fromEntries(
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
      (quality) => [quality, 0]
    )
  ) as PlayerReport['counts'];

  return {
    accuracy: 80,
    phaseAccuracy: { opening: 90, middlegame: 75, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 85, tactics: 70, strategy: 78, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: zeroCounts,
    acpl: 20,
    estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' },
    tacticMotifs: zeroTacticMotifs(),
    ...overrides
  } as PlayerReport;
}

describe('comparePlayerBaseline', () => {
  test('puts this game beside the mean of the baseline games', () => {
    const comparison = comparePlayerBaseline(buildPlayerReport({ accuracy: 60 }), [
      buildPlayerReport({ accuracy: 70 }),
      buildPlayerReport({ accuracy: 80 })
    ]);

    expect(comparison.baselineGames).toBe(2);
    expect(comparison.accuracy).toEqual({ game: 60, baseline: 75 });
  });

  test('a null score in this game stays null instead of being read as zero', () => {
    const comparison = comparePlayerBaseline(buildPlayerReport(), [buildPlayerReport()]);

    expect(comparison.scores.endgame).toEqual({ game: null, baseline: null });
    expect(comparison.scores.tactics.game).toBe(70);
  });

  test('a score missing from some baseline games averages over the ones that have it', () => {
    const comparison = comparePlayerBaseline(buildPlayerReport(), [
      buildPlayerReport({ scores: { opening: 85, tactics: 70, strategy: 78, endgame: 40 } }),
      buildPlayerReport()
    ]);

    expect(comparison.scores.endgame.baseline).toBe(40);
  });

  test('mistake counts are per game, so one game is comparable to a long baseline', () => {
    const withBlunders = (blunder: number, miss: number): Partial<PlayerReport> => ({
      counts: { ...buildPlayerReport().counts, blunder, miss }
    });
    const comparison = comparePlayerBaseline(buildPlayerReport(withBlunders(3, 2)), [
      buildPlayerReport(withBlunders(1, 0)),
      buildPlayerReport(withBlunders(0, 2))
    ]);

    expect(comparison.blundersPerGame).toEqual({ game: 3, baseline: 0.5 });
    expect(comparison.missesPerGame).toEqual({ game: 2, baseline: 1 });
  });

  test('only motifs the student actually had a chance at are compared', () => {
    const comparison = comparePlayerBaseline(
      buildPlayerReport({ tacticMotifs: zeroTacticMotifs({ fork: { opportunities: 2, found: 0 } }) }),
      [buildPlayerReport({ tacticMotifs: zeroTacticMotifs({ pin: { opportunities: 4, found: 3 } }) })]
    );

    expect(comparison.tactics.map((row) => row.motif).sort()).toEqual(['fork', 'pin']);
    expect(comparison.tactics.find((row) => row.motif === 'fork')).toMatchObject({
      gameOpportunities: 2,
      gameFound: 0,
      baselineOpportunities: 0
    });
  });

  test('with no baseline games every baseline figure is null rather than a fake zero', () => {
    const comparison = comparePlayerBaseline(buildPlayerReport(), []);

    expect(comparison.baselineGames).toBe(0);
    expect(comparison.accuracy.baseline).toBeNull();
    expect(comparison.blundersPerGame.baseline).toBeNull();
  });

  test('with no game report (a live game) the baseline still comes back on its own', () => {
    const comparison = comparePlayerBaseline(null, [buildPlayerReport({ accuracy: 70 })]);

    expect(comparison.accuracy).toEqual({ game: null, baseline: 70 });
    expect(comparison.blundersPerGame.game).toBeNull();
  });
});
