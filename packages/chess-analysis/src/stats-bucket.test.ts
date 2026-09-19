import {
  TACTIC_MOTIF_TYPES,
  type GameReport,
  type MoveReport,
  type PlayerReport,
  type StatsDashboard,
  type TacticMotifType
} from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildStatsDashboard } from './build-stats-dashboard.js';
import { mergeStatsBuckets } from './merge-stats-buckets.js';
import { emptyStatsBucket, statsBucketOf, toStatsBucket } from './stats-bucket.js';
import { referenceStatsDashboard } from './stats-dashboard-reference.js';
import type { StatsEntry } from './stats-entry.js';

type MotifCounts = Partial<
  Record<TacticMotifType, { opportunities: number; found: number; preventable?: number; prevented?: number }>
>;

function tacticMotifs(overrides: MotifCounts = {}) {
  const base = Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
  return { ...base, ...overrides } as PlayerReport['tacticMotifs'];
}

function playerReport(overrides: Partial<PlayerReport> = {}): PlayerReport {
  const counts = Object.fromEntries(
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
    counts,
    acpl: 20,
    estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' },
    tacticMotifs: tacticMotifs(),
    ...overrides
  };
}

function openingMove(quality: MoveReport['quality']): MoveReport {
  return { mover: 'white', phase: 'opening', quality } as unknown as MoveReport;
}

interface GameOptions {
  white?: Partial<PlayerReport>;
  bookName?: string | null;
  eco?: string | null;
  lastBookPly?: number;
  moves?: MoveReport[];
}

function gameReport(options: GameOptions = {}): GameReport {
  const playerBook = { lastBookPly: options.lastBookPly ?? 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] };
  return {
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book: {
      source: 'test@1',
      eco: options.eco === undefined ? 'C50' : options.eco,
      ecoVolume: 'C',
      name: options.bookName === undefined ? 'Italian Game' : options.bookName,
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: { white: playerBook, black: playerBook }
    },
    phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
    players: { white: playerReport(options.white), black: playerReport() },
    moves: options.moves ?? []
  } as unknown as GameReport;
}

function entry(options: GameOptions & Partial<Pick<StatsEntry, 'result' | 'playedAt' | 'speed'>> = {}): StatsEntry {
  const { result = 'win', playedAt = null, speed = 'rapid', ...gameOptions } = options;
  return { gameReport: gameReport(gameOptions), result, userColor: 'white', playedAt, speed };
}

/** Wins, losses and draws; null accuracies; missing strategy sub-scores; an
 * unknown opening; `preventable` reported on some games and absent on
 * others; endgames of several standings and themes. Opening game counts are
 * all distinct so the by-opening order has no ties. */
function fixtureEntries(): StatsEntry[] {
  return [
    entry({ result: 'win', playedAt: new Date('2026-03-02T10:00:00Z'), moves: [openingMove('mistake'), openingMove('good')] }),
    entry({ result: 'loss', playedAt: new Date('2026-03-03T10:00:00Z'), white: { accuracy: 60, phaseAccuracy: { opening: null, middlegame: 50, endgame: 40 }, endgame: { standing: 'worse', theme: 'queen' } } }),
    entry({ result: 'draw', playedAt: new Date('2026-03-09T10:00:00Z'), bookName: 'Sicilian Defense', white: { accuracy: 70, phaseAccuracy: { opening: 80, middlegame: 70, endgame: 90 }, endgame: { standing: 'equal', theme: 'rookAndPawn' }, tacticMotifs: tacticMotifs({ fork: { opportunities: 3, found: 1, preventable: 2, prevented: 2 } }) } }),
    entry({ result: 'win', playedAt: new Date('2026-03-10T10:00:00Z'), bookName: 'Sicilian Defense', white: { strategySubScores: { pawnStructure: null, spaceAdvantage: 50, activePiece: null, attacking: 60, defending: null }, scores: { opening: 80, tactics: 70, strategy: null, endgame: null }, tacticMotifs: tacticMotifs({ fork: { opportunities: 1, found: 1 }, pin: { opportunities: 2, found: 0 } }) } }),
    entry({ result: 'win', playedAt: new Date('2026-03-16T10:00:00Z'), bookName: null, eco: null, lastBookPly: 0, white: { estimatedRating: { value: null, range: null, confidence: 'low' }, endgame: { standing: 'winning', theme: 'kingAndPawn' }, phaseAccuracy: { opening: 88, middlegame: 70, endgame: null } } }),
    entry({ result: 'loss', playedAt: null, speed: 'blitz', white: { estimatedRating: { value: 1620, range: [1500, 1700], confidence: 'medium' } } }),
    entry({ result: 'draw', playedAt: new Date('2026-03-17T10:00:00Z'), bookName: 'Sicilian Defense', white: { endgame: { standing: 'equal', theme: 'queen' }, phaseAccuracy: { opening: 70, middlegame: 60, endgame: 55 } } })
  ];
}

const WEEK = '2026-03-02';

describe('buildStatsDashboard over mergeable buckets', () => {
  test('equals the frozen per-game reference implementation on a varied fixture', () => {
    const entries = fixtureEntries();
    expect(buildStatsDashboard(entries)).toEqual(referenceStatsDashboard(entries));
  });

  test('equals the reference for every prefix of the fixture, including no games at all', () => {
    const entries = fixtureEntries();
    for (let size = 0; size <= entries.length; size++) {
      expect(buildStatsDashboard(entries.slice(0, size))).toEqual(referenceStatsDashboard(entries.slice(0, size)));
    }
  });

  test('preventable/prevented stay absent — not 0 — when no game reported them', () => {
    const dashboard = buildStatsDashboard([entry(), entry()]);
    expect(dashboard.tactics.fork).toEqual({ opportunities: 0, found: 0 });
    expect('preventable' in dashboard.tactics.fork).toBe(false);
    expect('prevented' in dashboard.tactics.fork).toBe(false);
  });

  test('preventable/prevented sum only the games that reported them', () => {
    const dashboard = buildStatsDashboard(fixtureEntries());
    expect(dashboard.tactics.fork).toEqual({ opportunities: 4, found: 2, preventable: 2, prevented: 2 });
    expect('preventable' in dashboard.tactics.pin).toBe(false);
  });

  test('ties in games played order the openings by name, whatever the archive\'s key order', () => {
    const entries = [entry({ bookName: 'Zebra Opening' }), entry({ bookName: 'Aardvark Opening' })];
    const names = buildStatsDashboard(entries).opening.performanceByOpening.map((row) => row.opening);
    expect(names).toEqual(['Aardvark Opening', 'Zebra Opening']);
  });
});

describe('mergeStatsBuckets', () => {
  const buckets = () => fixtureEntries().map(toStatsBucket);

  test('emptyStatsBucket is the identity', () => {
    for (const bucket of buckets()) {
      expect(mergeStatsBuckets(emptyStatsBucket(), bucket)).toEqual(bucket);
      expect(mergeStatsBuckets(bucket, emptyStatsBucket())).toEqual(bucket);
    }
  });

  test('is commutative and associative', () => {
    const [a, b, c] = buckets() as [ReturnType<typeof toStatsBucket>, ReturnType<typeof toStatsBucket>, ReturnType<typeof toStatsBucket>];
    expect(mergeStatsBuckets(a, b)).toEqual(mergeStatsBuckets(b, a));
    expect(mergeStatsBuckets(mergeStatsBuckets(a, b), c)).toEqual(mergeStatsBuckets(a, mergeStatsBuckets(b, c)));
  });

  test('splitting the entries across any two buckets and merging equals one bucket of all of them', () => {
    const entries = fixtureEntries();
    const whole = statsBucketOf(entries);
    for (let split = 0; split <= entries.length; split++) {
      const merged = mergeStatsBuckets(statsBucketOf(entries.slice(0, split)), statsBucketOf(entries.slice(split)));
      expect(merged).toEqual(whole);
    }
  });

  test('a bucket survives a JSON round trip unchanged (it is stored as jsonb)', () => {
    const bucket = statsBucketOf(fixtureEntries());
    expect(JSON.parse(JSON.stringify(bucket))).toEqual(bucket);
  });
});

describe('buildStatsDashboard with archived weeks', () => {
  function withoutRating(dashboard: StatsDashboard): Omit<StatsDashboard, 'rating'> {
    const { rating: _rating, ...rest } = dashboard;
    return rest;
  }

  test('archive + live equals the reference over all the games, apart from the rating trend', () => {
    const entries = fixtureEntries();
    const archived = statsBucketOf(entries.slice(0, 4));

    const dashboard = buildStatsDashboard(entries.slice(4), [{ weekStart: WEEK, bucket: archived }]);

    expect(withoutRating(dashboard)).toEqual(withoutRating(referenceStatsDashboard(entries)));
    expect(dashboard.rating.gamesWithEstimate).toBe(referenceStatsDashboard(entries).rating.gamesWithEstimate);
  });

  test('an archived week is one rating point at the week start, at the mean estimate, merged in date order', () => {
    const archived = statsBucketOf([
      entry({ playedAt: new Date('2026-03-02T10:00:00Z'), white: { estimatedRating: { value: 1400, range: [1300, 1500], confidence: 'medium' } } }),
      entry({ playedAt: new Date('2026-03-03T10:00:00Z'), white: { estimatedRating: { value: 1500, range: [1400, 1600], confidence: 'medium' } } })
    ]);
    const live = entry({ playedAt: new Date('2026-03-20T10:00:00Z'), white: { estimatedRating: { value: 1700, range: [1600, 1800], confidence: 'medium' } } });

    const { rating } = buildStatsDashboard([live], [{ weekStart: WEEK, bucket: archived }]);

    expect(rating.points).toEqual([
      { playedAt: '2026-03-02T00:00:00.000Z', estimatedRating: 1450 },
      { playedAt: '2026-03-20T10:00:00.000Z', estimatedRating: 1700 }
    ]);
    expect(rating.gamesWithEstimate).toBe(3);
  });

  test('several speeds in the same archived week share one rating point', () => {
    const rapid = statsBucketOf([entry({ playedAt: new Date('2026-03-02T10:00:00Z'), white: { estimatedRating: { value: 1400, range: [1300, 1500], confidence: 'medium' } } })]);
    const blitz = statsBucketOf([entry({ playedAt: new Date('2026-03-03T10:00:00Z'), speed: 'blitz', white: { estimatedRating: { value: 1600, range: [1500, 1700], confidence: 'medium' } } })]);

    const { rating } = buildStatsDashboard([], [{ weekStart: WEEK, bucket: rapid }, { weekStart: WEEK, bucket: blitz }]);

    expect(rating.points).toEqual([{ playedAt: '2026-03-02T00:00:00.000Z', estimatedRating: 1500 }]);
  });

  test('an archived week with no estimates adds no rating point', () => {
    const noEstimate = statsBucketOf([entry({ playedAt: new Date('2026-03-02T10:00:00Z'), white: { estimatedRating: { value: null, range: null, confidence: 'low' } } })]);

    const dashboard = buildStatsDashboard([], [{ weekStart: WEEK, bucket: noEstimate }]);

    expect(dashboard.rating).toEqual({ gamesWithEstimate: 0, points: [] });
    expect(dashboard.gamesAnalyzed).toBe(1);
  });
});
