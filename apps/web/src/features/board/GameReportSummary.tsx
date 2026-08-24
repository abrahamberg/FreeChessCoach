import { useState, type ReactNode } from 'react';
import { MOVE_QUALITIES, type ClassificationCounts, type EstimatedRatingReport, type GameReport, type MoveQuality } from '@freechesscoach/shared';
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

/** Daniel's call: a bare point estimate reads cleaner on a single-game
 * screen than the (min–max) range this used to show — the confidence
 * caveat lives in `reason` for the "not enough data" case only. */
function formatRating(rating: EstimatedRatingReport): string {
  return rating.value === null ? (rating.reason ?? 'Not enough data') : Math.round(rating.value).toString();
}

/** Polished, collapsible game report. The title bar and the headline stat
 * cards (accuracy + rating for both colours) are always visible — that's
 * the "first part of info" a student wants at a glance — while the phase
 * breakdown, skills, and classification counts stay behind an explicit
 * "Show full report" toggle, styled and labeled (not just a bare chevron)
 * so it reads as expandable rather than as the whole panel. Lives at the
 * bottom of the sidebar column, above the move list — expanding overlays it
 * rather than pushing it down, per SessionPage.css's `--expanded` rule, so
 * opening the report never disturbs the move list's scroll position. */
export function GameReportSummary({ report }: GameReportSummaryProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const { white, black } = report.players;

  function toggle(): void {
    setExpanded((value) => !value);
  }

  return (
    <section className={`game-report-summary${expanded ? ' game-report-summary--expanded' : ''}`}>
      <button type="button" className="game-report-summary__header" aria-expanded={expanded} onClick={toggle}>
        <span className="game-report-summary__title">Game Report</span>
        <span className="game-report-summary__chevron" aria-hidden="true">
          {expanded ? '⌄' : '⌃'}
        </span>
      </button>
      <div className="game-report-summary__headline">
        <HeadlineCard label="White" accuracy={white.accuracy} rating={white.estimatedRating} />
        <HeadlineCard label="Black" accuracy={black.accuracy} rating={black.estimatedRating} />
      </div>
      <button type="button" className="game-report-summary__expand-toggle" aria-expanded={expanded} onClick={toggle}>
        {expanded ? 'Hide full report' : 'Show full report'}
        <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="game-report-summary__body">
          <PhaseTable heading="Accuracy by phase" white={white.phaseAccuracy} black={black.phaseAccuracy} />
          <ScoresTable heading="Skills" white={white.scores} black={black.scores} />
          <div className="game-report-summary__counts">
            <CountsColumn label="White" counts={white.counts} />
            <CountsColumn label="Black" counts={black.counts} />
          </div>
        </div>
      )}
    </section>
  );
}

function HeadlineCard({ label, accuracy, rating }: { label: string; accuracy: number; rating: EstimatedRatingReport }): ReactNode {
  const ratingText = formatRating(rating);
  // A numeric rating reads fine at the same large size as the accuracy
  // figure; the textual fallback ("Not enough data"/a reason string) is a
  // whole phrase, not a stat — full size wraps it into the caption below it.
  const ratingIsNumeric = rating.value !== null;
  return (
    <div className="game-report-summary__headline-card">
      <h4>{label}</h4>
      <div className="game-report-summary__headline-stat">
        <span className="game-report-summary__headline-value game-report-summary__stat--percent">{formatPercent(accuracy)}</span>
        <span className="game-report-summary__headline-caption">accuracy</span>
      </div>
      <div className="game-report-summary__headline-stat">
        <span
          className={
            ratingIsNumeric
              ? 'game-report-summary__headline-value'
              : 'game-report-summary__headline-value game-report-summary__headline-value--text'
          }
        >
          {ratingText}
        </span>
        <span className="game-report-summary__headline-caption">rating</span>
      </div>
    </div>
  );
}

interface PhaseAccuracy {
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
}

function PhaseTable({ heading, white, black }: { heading: string; white: PhaseAccuracy; black: PhaseAccuracy }): ReactNode {
  return (
    <div className="game-report-summary__section">
      <h4>{heading}</h4>
      <table className="game-report-summary__table">
        <colgroup>
          <col className="game-report-summary__col-label" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">White</th>
            <th scope="col">Black</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Opening</th>
            <td className="game-report-summary__stat--percent">{formatPercent(white.opening)}</td>
            <td className="game-report-summary__stat--percent">{formatPercent(black.opening)}</td>
          </tr>
          <tr>
            <th scope="row">Middlegame</th>
            <td className="game-report-summary__stat--percent">{formatPercent(white.middlegame)}</td>
            <td className="game-report-summary__stat--percent">{formatPercent(black.middlegame)}</td>
          </tr>
          <tr>
            <th scope="row">Endgame</th>
            <td className="game-report-summary__stat--percent">{formatPercent(white.endgame)}</td>
            <td className="game-report-summary__stat--percent">{formatPercent(black.endgame)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface Scores {
  opening: number | null;
  tactics: number | null;
  strategy: number | null;
  endgame: number | null;
}

function ScoresTable({ heading, white, black }: { heading: string; white: Scores; black: Scores }): ReactNode {
  return (
    <div className="game-report-summary__section">
      <h4>{heading}</h4>
      <table className="game-report-summary__table">
        <colgroup>
          <col className="game-report-summary__col-label" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">White</th>
            <th scope="col">Black</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Opening</th>
            <td>{formatScore(white.opening)}</td>
            <td>{formatScore(black.opening)}</td>
          </tr>
          <tr>
            <th scope="row">Tactics</th>
            <td>{formatScore(white.tactics)}</td>
            <td>{formatScore(black.tactics)}</td>
          </tr>
          <tr>
            <th scope="row">Strategy</th>
            <td>{formatScore(white.strategy)}</td>
            <td>{formatScore(black.strategy)}</td>
          </tr>
          <tr>
            <th scope="row">Endgame</th>
            <td>{formatScore(white.endgame)}</td>
            <td>{formatScore(black.endgame)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CountsColumn({ label, counts }: { label: string; counts: ClassificationCounts }): ReactNode {
  return (
    <div className="game-report-summary__counts-column">
      <h4>{label}</h4>
      <ul className="game-report-summary__counts-list">
        {MOVE_QUALITIES.map((quality) => (
          <li key={quality} className={`game-report-summary__count--${quality}`}>
            <MoveQualityBadge quality={quality} size="sm" />
            <span className="game-report-summary__count-label">{COUNT_LABELS[quality]}</span>
            <span className="game-report-summary__count-value">{counts[quality]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
