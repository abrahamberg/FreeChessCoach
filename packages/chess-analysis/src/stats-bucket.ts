import {
  TACTIC_MOTIF_TYPES,
  type StatsBucket,
  type SumCount,
  type TacticMotifCounts
} from '@freechesscoach/shared';
import { mergeStatsBuckets } from './merge-stats-buckets.js';
import { openingMistakeCount } from './opening-mistakes.js';
import type { StatsEntry } from './stats-entry.js';

export type { StatsBucket, SumCount } from '@freechesscoach/shared';

/** One archived week (`stats_archive_weeks` row): the Monday-00:00-UTC date
 * it starts on (`YYYY-MM-DD`) and the bucket of every game deleted from it. */
export interface ArchivedStatsWeek {
  weekStart: string;
  bucket: StatsBucket;
}

const UNKNOWN_OPENING = 'Unknown opening';

export function emptySumCount(): SumCount {
  return { sum: 0, count: 0 };
}

/** A value that may be missing contributes to a mean only when present. */
function sumCountOf(value: number | null): SumCount {
  return value === null ? emptySumCount() : { sum: value, count: 1 };
}

function emptyTactics(): TacticMotifCounts {
  return Object.fromEntries(
    TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const)
  ) as TacticMotifCounts;
}

export function emptyStatsBucket(): StatsBucket {
  return {
    games: 0,
    opening: { bookMoves: emptySumCount(), accuracy: emptySumCount(), mistakes: emptySumCount(), byOpening: {} },
    tactics: emptyTactics(),
    strategy: {
      overall: emptySumCount(),
      pawnStructure: emptySumCount(),
      spaceAdvantage: emptySumCount(),
      activePiece: emptySumCount(),
      attacking: emptySumCount(),
      defending: emptySumCount()
    },
    endgame: { accuracy: emptySumCount(), byStanding: {}, byTheme: {} },
    rating: emptySumCount()
  };
}

function resultPoints(result: StatsEntry['result']): number {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

/** `preventable`/`prevented` are copied only when the game reported them, so
 * a bucket of pre-Phase-39 games keeps them absent rather than 0. */
function tacticsOf(motifs: TacticMotifCounts): TacticMotifCounts {
  const counts = emptyTactics();
  for (const type of TACTIC_MOTIF_TYPES) {
    const { opportunities, found, preventable, prevented } = motifs[type];
    counts[type] = {
      opportunities,
      found,
      ...(preventable !== undefined && { preventable }),
      ...(prevented !== undefined && { prevented })
    };
  }
  return counts;
}

function openingBucketOf(entry: StatsEntry): StatsBucket['opening'] {
  const { book, players, moves } = entry.gameReport;
  const player = players[entry.userColor];
  return {
    bookMoves: sumCountOf(book.players[entry.userColor].lastBookPly),
    accuracy: sumCountOf(player.phaseAccuracy.opening),
    mistakes: sumCountOf(openingMistakeCount(moves, entry.userColor)),
    byOpening: {
      [book.name ?? book.eco ?? UNKNOWN_OPENING]: {
        games: 1,
        points: resultPoints(entry.result),
        accuracySum: player.accuracy
      }
    }
  };
}

function endgameBucketOf(entry: StatsEntry): StatsBucket['endgame'] {
  const player = entry.gameReport.players[entry.userColor];
  const { standing, theme } = player.endgame;
  const endgameAccuracy = player.phaseAccuracy.endgame;
  return {
    accuracy: sumCountOf(endgameAccuracy),
    byStanding: standing
      ? {
          [standing]: {
            games: 1,
            wins: entry.result === 'win' ? 1 : 0,
            losses: entry.result === 'loss' ? 1 : 0,
            draws: entry.result === 'draw' ? 1 : 0
          }
        }
      : {},
    byTheme: theme ? { [theme]: { games: 1, accuracy: sumCountOf(endgameAccuracy) } } : {}
  };
}

/** Rating counts only games with an estimate *and* a known date — the same
 * games the per-game trend plots (`aggregateRatingStats`). */
function ratingBucketOf(entry: StatsEntry): SumCount {
  const { value } = entry.gameReport.players[entry.userColor].estimatedRating;
  return entry.playedAt === null ? emptySumCount() : sumCountOf(value);
}

/** One game as a bucket — the "reduce" step of the stats dashboard. */
export function toStatsBucket(entry: StatsEntry): StatsBucket {
  const player = entry.gameReport.players[entry.userColor];
  return {
    games: 1,
    opening: openingBucketOf(entry),
    tactics: tacticsOf(player.tacticMotifs),
    strategy: {
      overall: sumCountOf(player.scores.strategy),
      pawnStructure: sumCountOf(player.strategySubScores.pawnStructure),
      spaceAdvantage: sumCountOf(player.strategySubScores.spaceAdvantage),
      activePiece: sumCountOf(player.strategySubScores.activePiece),
      attacking: sumCountOf(player.strategySubScores.attacking),
      defending: sumCountOf(player.strategySubScores.defending)
    },
    endgame: endgameBucketOf(entry),
    rating: ratingBucketOf(entry)
  };
}

/** Left fold in entry order, so a bucket's sums add in exactly the order a
 * per-game mean would — the same floating-point result. */
export function statsBucketOf(entries: StatsEntry[]): StatsBucket {
  return entries.reduce((total, entry) => mergeStatsBuckets(total, toStatsBucket(entry)), emptyStatsBucket());
}
