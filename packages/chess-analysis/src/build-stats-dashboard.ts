import {
  ENDGAME_STANDINGS,
  ENDGAME_THEMES,
  TACTIC_MOTIF_TYPES,
  type EndgameStandingRow,
  type EndgameStats,
  type EndgameThemeRow,
  type StatsDashboard,
  type StrategyStats,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';
import { aggregateOpeningStats } from './aggregate-opening-stats.js';
import type { StatsEntry } from './stats-entry.js';

export type { EndgameStandingRow, EndgameStats, EndgameThemeRow, StatsDashboard, StrategyStats } from '@freechesscoach/shared';

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
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
export function buildStatsDashboard(entries: StatsEntry[]): StatsDashboard {
  return {
    gamesAnalyzed: entries.length,
    opening: aggregateOpeningStats(entries),
    tactics: aggregateTacticMotifs(entries),
    strategy: aggregateStrategyStats(entries),
    endgame: aggregateEndgameStats(entries)
  };
}
