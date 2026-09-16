import type { PlayerBaselineComparison, ScoreKey, StatComparison, TacticComparison } from '@freechesscoach/chess-analysis';
import { TACTIC_MOTIF_LABELS } from '@freechesscoach/shared';

/**
 * Coach-facing digest for the `get_player_stats` tool: this game beside the
 * student's own usual figures, so the coach can choose what the session is
 * ABOUT from evidence instead of from the impression one game leaves
 * (AGENTS.md golden rule 8 — short prose, never a table of raw rows).
 *
 * The rule throughout: state the comparison, not the number. A score on its
 * own tells a coach nothing; "12 below your usual" is the coaching fact.
 */
export interface PlayerStatsInput {
  comparison: PlayerBaselineComparison;
  /** Which slice of games the baseline is ("rapid games", "all time
   * controls") — resolved by the caller, since only it knows how the
   * baseline was filtered. */
  baselineLabel: string;
}

const SCORE_LABELS: Record<ScoreKey, string> = {
  opening: 'Opening',
  tactics: 'Tactics',
  strategy: 'Strategy',
  endgame: 'Endgame'
};

/** A score is out of ~100, so single-digit noise between games is not a
 * signal — only a gap this wide is worth a coach changing plan over. */
const NOTABLE_SCORE_GAP = 8;

export function renderPlayerStats(input: PlayerStatsInput): string {
  const { comparison, baselineLabel } = input;
  if (comparison.baselineGames === 0 && comparison.accuracy.game === null) {
    return 'No analyzed games yet for this student, and no report for this game — nothing to compare. Plan from their focus areas and get_diagnostic_profile instead.';
  }

  return [
    `Baseline: ${comparison.baselineGames} ${baselineLabel} (this game excluded).`,
    accuracyLine(comparison),
    scoresBlock(comparison),
    mistakesLine(comparison),
    tacticsBlock(comparison.tactics),
    standoutLine(comparison)
  ]
    .filter(Boolean)
    .join('\n\n');
}

function accuracyLine(comparison: PlayerBaselineComparison): string {
  return `Accuracy: ${describeComparison(comparison.accuracy, 1)}%.`;
}

function scoresBlock(comparison: PlayerBaselineComparison): string {
  const rows = (Object.keys(SCORE_LABELS) as ScoreKey[])
    .map((key) => ({ key, value: comparison.scores[key] }))
    .filter((row) => row.value.game !== null || row.value.baseline !== null)
    .map((row) => `- ${SCORE_LABELS[row.key]}: ${describeComparison(row.value, 0)}`);
  return rows.length === 0 ? '' : `Scores this game vs usual:\n${rows.join('\n')}`;
}

function mistakesLine(comparison: PlayerBaselineComparison): string {
  return `Per game — blunders ${describeComparison(comparison.blundersPerGame, 1)}, mistakes ${describeComparison(
    comparison.mistakesPerGame,
    1
  )}, missed wins ${describeComparison(comparison.missesPerGame, 1)}.`;
}

function tacticsBlock(tactics: TacticComparison[]): string {
  const rows = tactics.map(
    (row) =>
      `- ${TACTIC_MOTIF_LABELS[row.motif]}: ${row.gameFound}/${row.gameOpportunities} this game, ${row.baselineFound}/${row.baselineOpportunities} across the baseline`
  );
  return rows.length === 0 ? '' : `Tactics the engine says were there to find:\n${rows.join('\n')}`;
}

/**
 * The one line worth acting on: where this game is genuinely unlike the
 * student's own record. Everything above is reference data; this is the
 * part that should decide what the session is about.
 */
function standoutLine(comparison: PlayerBaselineComparison): string {
  if (comparison.baselineGames === 0) return 'No baseline yet — treat this game as the first data point, not as a trend.';
  // Play mode (architecture §14): a live game has no report to compare, so
  // there is nothing "out of line" to name — say what these figures are
  // instead of letting the typical-game line claim a comparison never made.
  if (comparison.accuracy.game === null) {
    return 'This game has no report of its own (a live game never gets one) — the figures above are the student\'s usual, and that is what to plan against.';
  }

  const standouts = (Object.keys(SCORE_LABELS) as ScoreKey[])
    .map((key) => ({ label: SCORE_LABELS[key], gap: gapOf(comparison.scores[key]) }))
    .filter((row): row is { label: string; gap: number } => row.gap !== null && Math.abs(row.gap) >= NOTABLE_SCORE_GAP)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .map((row) => `${row.label} ${row.gap > 0 ? 'well above' : 'well below'} their usual (${signed(row.gap)})`);

  if (standouts.length === 0) return 'Out of line this game: nothing — this game is typical for them, so trust the standing focus areas over anything it seems to show.';
  return `Out of line this game: ${standouts.join('; ')}.`;
}

function gapOf(value: StatComparison): number | null {
  if (value.game === null || value.baseline === null) return null;
  return value.game - value.baseline;
}

function describeComparison(value: StatComparison, decimals: number): string {
  const game = value.game === null ? 'not measured' : value.game.toFixed(decimals);
  const baseline = value.baseline === null ? 'no baseline' : value.baseline.toFixed(decimals);
  return `${game} this game vs ${baseline} usual`;
}

function signed(gap: number): string {
  return `${gap > 0 ? '+' : ''}${gap.toFixed(0)}`;
}
