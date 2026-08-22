import type { ReactNode } from 'react';
import { MOVE_QUALITIES, type ClassificationCounts, type EstimatedRatingReport, type GameReport, type MoveQuality } from '@chess-coach/shared';
import { MoveQualityBadge } from './MoveQualityBadge.js';
import './GameReportSummary.css';

export interface GameReportSummaryProps {
  report: GameReport;
}

const COUNT_LABELS: Record<MoveQuality, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracies',
  mistake: 'Mistakes',
  miss: 'Misses',
  blunder: 'Blunders',
  forced: 'Forced'
};

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatScore(value: number | null): string {
  return value === null ? '—' : Math.round(value).toString();
}

/** §8.1: a bare point estimate isn't trustworthy from one game — always shown
 * with its range, or with the reason it's absent (e.g. too few moves). */
function formatRating(rating: EstimatedRatingReport): string {
  if (rating.value === null || rating.range === null) return rating.reason ?? 'Not enough data';
  return `${rating.value} (${rating.range[0]}–${rating.range[1]})`;
}

/** design.md-adjacent game report summary (like MoveExplorer, not yet in
 * design.md — Daniel's original "Game Review"-style ask): headline accuracy,
 * phase accuracy, the four §7 scores, classification counts, and the rating
 * estimate as a range, for both colours side by side. */
export function GameReportSummary({ report }: GameReportSummaryProps): ReactNode {
  const { white, black } = report.players;

  return (
    <section className="game-report-summary">
      <h3 className="game-report-summary__heading">Game Report</h3>
      <table className="game-report-summary__table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">White</th>
            <th scope="col">Black</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Accuracy</th>
            <td>{formatPercent(white.accuracy)}</td>
            <td>{formatPercent(black.accuracy)}</td>
          </tr>
          <tr>
            <th scope="row">Opening</th>
            <td>{formatPercent(white.phaseAccuracy.opening)}</td>
            <td>{formatPercent(black.phaseAccuracy.opening)}</td>
          </tr>
          <tr>
            <th scope="row">Middlegame</th>
            <td>{formatPercent(white.phaseAccuracy.middlegame)}</td>
            <td>{formatPercent(black.phaseAccuracy.middlegame)}</td>
          </tr>
          <tr>
            <th scope="row">Endgame</th>
            <td>{formatPercent(white.phaseAccuracy.endgame)}</td>
            <td>{formatPercent(black.phaseAccuracy.endgame)}</td>
          </tr>
          <tr>
            <th scope="row">Opening score</th>
            <td>{formatScore(white.scores.opening)}</td>
            <td>{formatScore(black.scores.opening)}</td>
          </tr>
          <tr>
            <th scope="row">Tactics score</th>
            <td>{formatScore(white.scores.tactics)}</td>
            <td>{formatScore(black.scores.tactics)}</td>
          </tr>
          <tr>
            <th scope="row">Strategy score</th>
            <td>{formatScore(white.scores.strategy)}</td>
            <td>{formatScore(black.scores.strategy)}</td>
          </tr>
          <tr>
            <th scope="row">Endgame score</th>
            <td>{formatScore(white.scores.endgame)}</td>
            <td>{formatScore(black.scores.endgame)}</td>
          </tr>
          <tr>
            <th scope="row">Estimated rating</th>
            <td>{formatRating(white.estimatedRating)}</td>
            <td>{formatRating(black.estimatedRating)}</td>
          </tr>
        </tbody>
      </table>
      <div className="game-report-summary__counts">
        <CountsColumn label="White" counts={white.counts} />
        <CountsColumn label="Black" counts={black.counts} />
      </div>
    </section>
  );
}

function CountsColumn({ label, counts }: { label: string; counts: ClassificationCounts }): ReactNode {
  return (
    <div className="game-report-summary__counts-column">
      <h4>{label}</h4>
      <ul className="game-report-summary__counts-list">
        {MOVE_QUALITIES.map((quality) => (
          <li key={quality}>
            <MoveQualityBadge quality={quality} size="sm" />
            <span className="game-report-summary__count-label">{COUNT_LABELS[quality]}</span>
            <span className="game-report-summary__count-value">{counts[quality]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
