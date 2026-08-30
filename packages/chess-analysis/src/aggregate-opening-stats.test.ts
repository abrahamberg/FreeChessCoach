import type { GameReport, MoveReport, PlayerReport } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { aggregateOpeningStats } from './aggregate-opening-stats.js';
import type { StatsEntry } from './stats-entry.js';

function move(overrides: Partial<MoveReport> & Pick<MoveReport, 'ply' | 'moveSan' | 'mover' | 'quality' | 'phase'>): MoveReport {
  return {
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  };
}

function buildPlayerReport(overrides: Partial<PlayerReport> = {}): PlayerReport {
  const zeroCounts = Object.fromEntries(
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
      (quality) => [quality, 0]
    )
  ) as PlayerReport['counts'];
  const zeroTacticMotifs = Object.fromEntries(
    ['checkmate', 'brilliantSacrifice', 'fork', 'pin', 'discoveredAttack', 'removesDefender', 'trappedPiece', 'freePiece', 'other'].map(
      (type) => [type, { opportunities: 0, found: 0 }]
    )
  ) as PlayerReport['tacticMotifs'];

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
    tacticMotifs: zeroTacticMotifs,
    ...overrides
  };
}

function buildGameReport(
  options: {
    bookName?: string | null;
    bookEco?: string | null;
    lastBookPly?: number;
    moves?: MoveReport[];
    white?: Partial<PlayerReport>;
    black?: Partial<PlayerReport>;
  } = {}
): GameReport {
  const playerBook = { lastBookPly: options.lastBookPly ?? 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] };
  return {
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book: {
      source: 'lichess-chess-openings@2024.01',
      eco: options.bookEco === undefined ? 'C50' : options.bookEco,
      ecoVolume: 'C',
      name: options.bookName === undefined ? 'Italian Game' : options.bookName,
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: options.lastBookPly ?? 6,
      players: { white: playerBook, black: playerBook }
    },
    phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
    players: { white: buildPlayerReport(options.white), black: buildPlayerReport(options.black) },
    moves: options.moves ?? []
  } as unknown as GameReport;
}

function entry(overrides: Partial<StatsEntry> & { gameReport: GameReport }): StatsEntry {
  return { result: 'win', userColor: 'white', playedAt: null, speed: 'rapid', ...overrides };
}

describe('aggregateOpeningStats', () => {
  test('averages book moves, opening accuracy, and opening mistakes across games', () => {
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({ lastBookPly: 6, white: { phaseAccuracy: { opening: 90, middlegame: 75, endgame: null } } }),
        userColor: 'white',
        result: 'win'
      }),
      entry({
        gameReport: buildGameReport({ lastBookPly: 10, white: { phaseAccuracy: { opening: 70, middlegame: 75, endgame: null } } }),
        userColor: 'white',
        result: 'loss'
      })
    ];

    const stats = aggregateOpeningStats(entries);

    expect(stats.averageBookMoves).toBe(8);
    expect(stats.openingAccuracy).toBe(80);
    expect(stats.averageOpeningMistakes).toBe(0);
  });

  test('counts opening-phase mistakes for the user colour via openingMistakeCount', () => {
    const entries: StatsEntry[] = [
      entry({
        gameReport: buildGameReport({
          moves: [
            move({ ply: 1, moveSan: 'e4', mover: 'white', phase: 'opening', quality: 'blunder' }),
            move({ ply: 2, moveSan: 'e5', mover: 'black', phase: 'opening', quality: 'blunder' })
          ]
        }),
        userColor: 'white'
      })
    ];

    expect(aggregateOpeningStats(entries).averageOpeningMistakes).toBe(1);
  });

  test('two games sharing an opening name aggregate into one performance row', () => {
    const entries: StatsEntry[] = [
      entry({ gameReport: buildGameReport({ bookName: 'Italian Game' }), userColor: 'white', result: 'win' }),
      entry({ gameReport: buildGameReport({ bookName: 'Italian Game' }), userColor: 'white', result: 'loss' })
    ];

    const stats = aggregateOpeningStats(entries);

    expect(stats.performanceByOpening).toHaveLength(1);
    expect(stats.performanceByOpening[0]).toMatchObject({ opening: 'Italian Game', gamesPlayed: 2, winPct: 50 });
  });

  test('a null book name falls back to eco, then to "Unknown opening", never dropping the game', () => {
    const entries: StatsEntry[] = [
      entry({ gameReport: buildGameReport({ bookName: null, bookEco: 'C50' }), userColor: 'white' }),
      entry({ gameReport: buildGameReport({ bookName: null, bookEco: null }), userColor: 'white' })
    ];

    const stats = aggregateOpeningStats(entries);
    const names = stats.performanceByOpening.map((row) => row.opening).sort();

    expect(names).toEqual(['C50', 'Unknown opening']);
  });

  test('sorts performance-by-opening rows by games played, descending', () => {
    const entries: StatsEntry[] = [
      entry({ gameReport: buildGameReport({ bookName: 'Sicilian Defense' }), userColor: 'white' }),
      entry({ gameReport: buildGameReport({ bookName: 'Italian Game' }), userColor: 'white' }),
      entry({ gameReport: buildGameReport({ bookName: 'Italian Game' }), userColor: 'white' })
    ];

    const stats = aggregateOpeningStats(entries);

    expect(stats.performanceByOpening.map((row) => row.opening)).toEqual(['Italian Game', 'Sicilian Defense']);
  });

  test('returns nulls (not zeros) for the scalar stats when there are no entries', () => {
    const stats = aggregateOpeningStats([]);

    expect(stats.averageBookMoves).toBeNull();
    expect(stats.openingAccuracy).toBeNull();
    expect(stats.averageOpeningMistakes).toBeNull();
    expect(stats.performanceByOpening).toEqual([]);
  });
});
