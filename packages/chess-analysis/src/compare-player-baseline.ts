import {
  TACTIC_MOTIF_TYPES,
  type PlayerReport,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';

/**
 * Backs the coach agent's `get_player_stats` tool: what this ONE game did
 * against what the student usually does. A single game's accuracy or tactic
 * count means very little on its own — "you were 12 points below your usual
 * in tactics today" is a coaching fact; "your tactics score was 45" is not.
 *
 * Pure (AGENTS rule 5): the caller resolves which games make up the
 * baseline (same time-control class, this game excluded) and
 * `packages/prompts` renders the coach-facing text; this only does the
 * arithmetic.
 */
export interface StatComparison {
  /** Null when this game has no figure for it (a game that never reached an
   * endgame has no endgame score) — never silently zeroed. */
  game: number | null;
  /** Null when no baseline game has a figure for it. */
  baseline: number | null;
}

export interface TacticComparison {
  motif: TacticMotifType;
  gameFound: number;
  gameOpportunities: number;
  baselineFound: number;
  baselineOpportunities: number;
}

export type ScoreKey = 'opening' | 'tactics' | 'strategy' | 'endgame';

export interface PlayerBaselineComparison {
  baselineGames: number;
  accuracy: StatComparison;
  scores: Record<ScoreKey, StatComparison>;
  /** Per game, so a 40-game baseline is comparable to one game. */
  blundersPerGame: StatComparison;
  mistakesPerGame: StatComparison;
  missesPerGame: StatComparison;
  /** Only motifs the student actually had an opportunity at, this game or
   * across the baseline — the rest is noise. */
  tactics: TacticComparison[];
}

const SCORE_KEYS: readonly ScoreKey[] = ['opening', 'tactics', 'strategy', 'endgame'];

export function comparePlayerBaseline(game: PlayerReport | null, history: readonly PlayerReport[]): PlayerBaselineComparison {
  return {
    baselineGames: history.length,
    accuracy: { game: game?.accuracy ?? null, baseline: mean(history.map((report) => report.accuracy)) },
    scores: Object.fromEntries(SCORE_KEYS.map((key) => [key, scoreComparison(key, game, history)])) as Record<ScoreKey, StatComparison>,
    blundersPerGame: countComparison(game, history, 'blunder'),
    mistakesPerGame: countComparison(game, history, 'mistake'),
    missesPerGame: countComparison(game, history, 'miss'),
    tactics: tacticComparisons(game, history)
  };
}

function scoreComparison(key: ScoreKey, game: PlayerReport | null, history: readonly PlayerReport[]): StatComparison {
  return {
    game: game?.scores[key] ?? null,
    baseline: mean(history.map((report) => report.scores[key]))
  };
}

function countComparison(
  game: PlayerReport | null,
  history: readonly PlayerReport[],
  quality: 'blunder' | 'mistake' | 'miss'
): StatComparison {
  return {
    game: game ? game.counts[quality] : null,
    baseline: mean(history.map((report) => report.counts[quality]))
  };
}

function tacticComparisons(game: PlayerReport | null, history: readonly PlayerReport[]): TacticComparison[] {
  const baseline = sumMotifs(history.map((report) => report.tacticMotifs));
  return TACTIC_MOTIF_TYPES.map((motif) => ({
    motif,
    gameFound: game?.tacticMotifs[motif]?.found ?? 0,
    gameOpportunities: game?.tacticMotifs[motif]?.opportunities ?? 0,
    baselineFound: baseline[motif].found,
    baselineOpportunities: baseline[motif].opportunities
  })).filter((row) => row.gameOpportunities > 0 || row.baselineOpportunities > 0);
}

/** A motif key can be missing entirely on a report stored before that motif
 * existed (jsonb, no migration — see TacticMotifCountsSchema) — treated as
 * absent, never as a zero-opportunity game that would dilute the rate. */
function sumMotifs(all: readonly TacticMotifCounts[]): Record<TacticMotifType, { found: number; opportunities: number }> {
  const totals = Object.fromEntries(TACTIC_MOTIF_TYPES.map((motif) => [motif, { found: 0, opportunities: 0 }])) as Record<
    TacticMotifType,
    { found: number; opportunities: number }
  >;
  for (const motifs of all) {
    for (const motif of TACTIC_MOTIF_TYPES) {
      const entry = motifs[motif];
      if (!entry) continue;
      totals[motif].found += entry.found;
      totals[motif].opportunities += entry.opportunities;
    }
  }
  return totals;
}

function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}
