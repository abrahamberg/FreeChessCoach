import {
  TACTIC_MOTIF_TYPES,
  type EndgameStanding,
  type EndgameTheme,
  type GameReport,
  type PlayerReport,
  type TacticMotifType
} from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildStatsDashboard } from './build-stats-dashboard.js';
import type { StatsEntry } from './stats-entry.js';

function zeroTacticMotifs(
  overrides: Partial<Record<TacticMotifType, { opportunities: number; found: number; preventable?: number; prevented?: number }>> = {}
) {
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
  };
}

function buildGameReport(options: { white?: Partial<PlayerReport>; black?: Partial<PlayerReport> } = {}): GameReport {
  const playerBook = { lastBookPly: 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] };
  return {
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book: {
      source: 'lichess-chess-openings@2024.01',
      eco: 'C50',
      ecoVolume: 'C',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: { white: playerBook, black: playerBook }
    },
    phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
    players: { white: buildPlayerReport(options.white), black: buildPlayerReport(options.black) },
    moves: []
  } as unknown as GameReport;
}

function entry(overrides: Partial<StatsEntry> & { gameReport: GameReport }): StatsEntry {
  return { result: 'win', userColor: 'white', playedAt: null, speed: 'rapid', ...overrides };
}

describe('buildStatsDashboard', () => {
  test('is deterministic — same entries twice produce byte-identical output', () => {
    const entries: StatsEntry[] = [
      entry({ gameReport: buildGameReport(), result: 'win' }),
      entry({ gameReport: buildGameReport(), result: 'loss' })
    ];

    expect(JSON.stringify(buildStatsDashboard(entries))).toEqual(JSON.stringify(buildStatsDashboard(entries)));
  });

  test('sums tactic-motif opportunities and found across games, per motif type', () => {
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({ white: { tacticMotifs: zeroTacticMotifs({ fork: { opportunities: 3, found: 2 } }) } })
      }),
      entry({
        gameReport: buildGameReport({ white: { tacticMotifs: zeroTacticMotifs({ fork: { opportunities: 2, found: 1 } }) } })
      })
    ];

    const dashboard = buildStatsDashboard(entries);

    expect(dashboard.tactics.fork).toEqual({ opportunities: 5, found: 3 });
    expect(dashboard.tactics.pin).toEqual({ opportunities: 0, found: 0 });
  });

  test('sums preventable/prevented only across entries that report them, leaving them undefined otherwise', () => {
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({
          white: { tacticMotifs: zeroTacticMotifs({ fork: { opportunities: 3, found: 2, preventable: 2, prevented: 1 } }) }
        })
      }),
      entry({
        // Pre-Phase-39 game: no preventable/prevented recorded at all.
        gameReport: buildGameReport({ white: { tacticMotifs: zeroTacticMotifs({ fork: { opportunities: 2, found: 1 } }) } })
      })
    ];

    const dashboard = buildStatsDashboard(entries);

    expect(dashboard.tactics.fork).toEqual({ opportunities: 5, found: 3, preventable: 2, prevented: 1 });
    // No entry ever reported pin's preventable/prevented — stays undefined, not 0.
    expect(dashboard.tactics.pin.preventable).toBeUndefined();
    expect(dashboard.tactics.pin.prevented).toBeUndefined();
  });

  test('averages strategy sub-scores across games, skipping nulls', () => {
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({
          white: { strategySubScores: { pawnStructure: 80, spaceAdvantage: 70, activePiece: 90, attacking: 60, defending: 100 } }
        })
      }),
      entry({
        gameReport: buildGameReport({
          white: { strategySubScores: { pawnStructure: null, spaceAdvantage: 90, activePiece: 70, attacking: 80, defending: 60 } }
        })
      })
    ];

    const strategy = buildStatsDashboard(entries).strategy;

    expect(strategy.pawnStructure).toBe(80);
    expect(strategy.spaceAdvantage).toBe(80);
    expect(strategy.overall).toBe(78);
  });

  test('groups endgame games by standing (win% = wins / (wins+losses+0.5*draws)) and by theme (mean accuracy)', () => {
    const winning: EndgameStanding = 'winning';
    const kingAndPawn: EndgameTheme = 'kingAndPawn';
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({
          white: { endgame: { standing: winning, theme: kingAndPawn }, phaseAccuracy: { opening: 90, middlegame: 75, endgame: 80 } }
        }),
        result: 'win'
      }),
      entry({
        gameReport: buildGameReport({
          white: { endgame: { standing: winning, theme: kingAndPawn }, phaseAccuracy: { opening: 90, middlegame: 75, endgame: 60 } }
        }),
        result: 'loss'
      }),
      entry({
        gameReport: buildGameReport({ white: { endgame: { standing: null, theme: null }, phaseAccuracy: { opening: 90, middlegame: 75, endgame: null } } })
      })
    ];

    const endgame = buildStatsDashboard(entries).endgame;

    expect(endgame.byStanding).toEqual([{ standing: 'winning', gamesPlayed: 2, winPct: 50 }]);
    expect(endgame.byTheme).toEqual([{ theme: 'kingAndPawn', gamesPlayed: 2, accuracy: 70 }]);
    expect(endgame.overallAccuracy).toBe(70);
  });

  test('returns nulls and empty collections (never misleading zeros) when there are no entries', () => {
    const dashboard = buildStatsDashboard([]);

    expect(dashboard.gamesAnalyzed).toBe(0);
    expect(dashboard.opening.averageBookMoves).toBeNull();
    expect(dashboard.strategy.overall).toBeNull();
    expect(dashboard.endgame.overallAccuracy).toBeNull();
    expect(dashboard.endgame.byStanding).toEqual([]);
    expect(dashboard.endgame.byTheme).toEqual([]);
    expect(dashboard.tactics.fork).toEqual({ opportunities: 0, found: 0 });
  });
});
