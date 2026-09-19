/**
 * TEST-ONLY reference implementation: a frozen, verbatim copy of the
 * per-game stats aggregators as they were before the dashboard became
 * reduce/merge/finalize over `StatsBucket`s (docs/plan.md Task 68.2). It is
 * independent of `stats-bucket.ts`/`finalize-stats-dashboard.ts` on purpose,
 * so `stats-bucket.test.ts` can prove the new pipeline produces exactly what
 * this one does. Never import it from production code; do not "fix" it —
 * if the dashboard's meaning is meant to change, change the tests instead.
 */
import {
  ENDGAME_STANDINGS,
  ENDGAME_THEMES,
  TACTIC_MOTIF_TYPES,
  type EndgameStandingRow,
  type EndgameStats,
  type EndgameThemeRow,
  type OpeningPerformanceRow,
  type OpeningStats,
  type RatingHistoryPoint,
  type RatingStats,
  type StatsDashboard,
  type StrategyStats,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';
import { openingMistakeCount } from './opening-mistakes.js';
import type { StatsEntry } from './stats-entry.js';

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}



const UNKNOWN_OPENING = 'Unknown opening';

function resultPoints(result: StatsEntry['result']): number {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

function openingNameFor(entry: StatsEntry): string {
  return entry.gameReport.book.name ?? entry.gameReport.book.eco ?? UNKNOWN_OPENING;
}

function buildPerformanceByOpening(entries: StatsEntry[]): OpeningPerformanceRow[] {
  const groups = new Map<string, StatsEntry[]>();
  for (const entry of entries) {
    const name = openingNameFor(entry);
    const group = groups.get(name);
    if (group) group.push(entry);
    else groups.set(name, [entry]);
  }

  const rows = Array.from(groups.entries()).map(([opening, groupEntries]) => ({
    opening,
    gamesPlayed: groupEntries.length,
    winPct: (mean(groupEntries.map((entry) => resultPoints(entry.result))) ?? 0) * 100,
    accuracy: mean(groupEntries.map((entry) => entry.gameReport.players[entry.userColor].accuracy)) ?? 0
  }));

  return rows.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

/** Cross-game opening breakdown (Task 27.2) — mirrors chess.com's Opening
 * Statistics: average book depth, opening-phase accuracy, mistake rate, and
 * a per-opening performance table. */
export function referenceOpeningStats(entries: StatsEntry[]): OpeningStats {
  const bookMoves = entries.map((entry) => entry.gameReport.book.players[entry.userColor].lastBookPly);
  const openingAccuracies = entries
    .map((entry) => entry.gameReport.players[entry.userColor].phaseAccuracy.opening)
    .filter((value): value is number => value !== null);
  const openingMistakes = entries.map((entry) =>
    openingMistakeCount(entry.gameReport.moves, entry.userColor)
  );

  return {
    averageBookMoves: mean(bookMoves),
    openingAccuracy: mean(openingAccuracies),
    averageOpeningMistakes: mean(openingMistakes),
    performanceByOpening: buildPerformanceByOpening(entries)
  };
}



/** Cross-game estimated-rating trend (docs/algorith.md §8) — one point per
 * game, in the order it was actually played, so the Stats page can show how
 * a player's estimated rating has moved across their games. Deliberately
 * not a day/period average: a day with three games gets three points, not
 * one blended number. A game is excluded (never folded into a neighbour)
 * when it has no estimate (§8.5: fewer than 12 non-book moves) or no known
 * `playedAt` to place it by. */
export function referenceRatingStats(entries: StatsEntry[]): RatingStats {
  const points: RatingHistoryPoint[] = entries
    .flatMap((entry): RatingHistoryPoint[] => {
      const estimatedRating = entry.gameReport.players[entry.userColor].estimatedRating.value;
      if (estimatedRating === null || entry.playedAt === null) return [];
      return [{ playedAt: entry.playedAt.toISOString(), estimatedRating }];
    })
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  return { gamesWithEstimate: points.length, points };
}



function playerReportOf(entry: StatsEntry) {
  return entry.gameReport.players[entry.userColor];
}

/** `preventable`/`prevented` stay `undefined` (never assigned a running
 * total) unless at least one entry actually reports them — same
 * null-not-zero convention as `mean([])` above, so a dashboard with only
 * pre-Phase-39 games shows "not yet computed" for these two, not a
 * misleading 0. */
function aggregateTacticMotifs(entries: StatsEntry[]): TacticMotifCounts {
  const totals = Object.fromEntries(
    TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const)
  ) as Record<TacticMotifType, { opportunities: number; found: number; preventable?: number; prevented?: number }>;

  for (const entry of entries) {
    const motifs = playerReportOf(entry).tacticMotifs;
    for (const type of TACTIC_MOTIF_TYPES) {
      const row = totals[type];
      row.opportunities += motifs[type].opportunities;
      row.found += motifs[type].found;
      if (motifs[type].preventable !== undefined) row.preventable = (row.preventable ?? 0) + motifs[type].preventable;
      if (motifs[type].prevented !== undefined) row.prevented = (row.prevented ?? 0) + motifs[type].prevented;
    }
  }

  return totals as TacticMotifCounts;
}

function aggregateStrategyStats(entries: StatsEntry[]): StrategyStats {
  const overall = entries.map((entry) => playerReportOf(entry).scores.strategy).filter((v): v is number => v !== null);
  const pawnStructure = entries
    .map((entry) => playerReportOf(entry).strategySubScores.pawnStructure)
    .filter((v): v is number => v !== null);
  const spaceAdvantage = entries
    .map((entry) => playerReportOf(entry).strategySubScores.spaceAdvantage)
    .filter((v): v is number => v !== null);
  const activePiece = entries
    .map((entry) => playerReportOf(entry).strategySubScores.activePiece)
    .filter((v): v is number => v !== null);
  const attacking = entries
    .map((entry) => playerReportOf(entry).strategySubScores.attacking)
    .filter((v): v is number => v !== null);
  const defending = entries
    .map((entry) => playerReportOf(entry).strategySubScores.defending)
    .filter((v): v is number => v !== null);

  return {
    overall: mean(overall),
    pawnStructure: mean(pawnStructure),
    spaceAdvantage: mean(spaceAdvantage),
    activePiece: mean(activePiece),
    attacking: mean(attacking),
    defending: mean(defending)
  };
}

function winPctForBucket(entries: StatsEntry[]): number {
  const wins = entries.filter((entry) => entry.result === 'win').length;
  const losses = entries.filter((entry) => entry.result === 'loss').length;
  const draws = entries.filter((entry) => entry.result === 'draw').length;
  const denominator = wins + losses + draws * 0.5;
  return denominator === 0 ? 0 : (wins / denominator) * 100;
}

function aggregateEndgameStats(entries: StatsEntry[]): EndgameStats {
  const endgameAccuracies = entries
    .map((entry) => playerReportOf(entry).phaseAccuracy.endgame)
    .filter((v): v is number => v !== null);

  const byStanding: EndgameStandingRow[] = ENDGAME_STANDINGS.map((standing) => {
    const bucket = entries.filter((entry) => playerReportOf(entry).endgame.standing === standing);
    return { standing, gamesPlayed: bucket.length, winPct: winPctForBucket(bucket) };
  }).filter((row) => row.gamesPlayed > 0);

  const byTheme: EndgameThemeRow[] = ENDGAME_THEMES.map((theme) => {
    const bucket = entries.filter((entry) => playerReportOf(entry).endgame.theme === theme);
    const accuracies = bucket
      .map((entry) => playerReportOf(entry).phaseAccuracy.endgame)
      .filter((v): v is number => v !== null);
    return { theme, gamesPlayed: bucket.length, accuracy: mean(accuracies) ?? 0 };
  }).filter((row) => row.gamesPlayed > 0);

  return { overallAccuracy: mean(endgameAccuracies), byStanding, byTheme };
}

/** Cross-game stats dashboard aggregator (Phase 28) — the pure composition
 * root for the chess.com-style Insights page. Every section is null/empty
 * (never a misleading 0) when `entries` carries no usable signal for it. */
export function referenceStatsDashboard(entries: StatsEntry[]): StatsDashboard {
  return {
    gamesAnalyzed: entries.length,
    opening: referenceOpeningStats(entries),
    tactics: aggregateTacticMotifs(entries),
    strategy: aggregateStrategyStats(entries),
    endgame: aggregateEndgameStats(entries),
    rating: referenceRatingStats(entries)
  };
}
