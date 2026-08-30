import { TACTIC_MOTIF_TYPES, type TacticMotifCounts, type TacticMotifType } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface TacticsStatsSectionProps {
  motifs: TacticMotifCounts;
}

/** chess.com's own category names for these motifs, per the user's original
 * request framing ("3 of them was best move forks... user found 2"). */
const MOTIF_LABELS: Record<TacticMotifType, string> = {
  checkmate: 'Checkmates',
  brilliantSacrifice: 'Brilliant Sacrifices',
  fork: 'Forks',
  pin: 'Pins',
  discoveredAttack: 'Discoveries',
  removesDefender: 'Removes Defender',
  trappedPiece: 'Trapped Pieces',
  freePiece: 'Free Pieces',
  other: 'Other Tactics'
};

/** design.md's Tactics card (Task 30.2): each motif as a "found N of M
 * opportunities" pair — presentational only. Motifs with zero opportunities
 * across the filtered games are omitted rather than shown as "0 of 0". */
export function TacticsStatsSection({ motifs }: TacticsStatsSectionProps): ReactNode {
  const rows = TACTIC_MOTIF_TYPES.map((type) => ({ type, ...motifs[type] }))
    .filter((row) => row.opportunities > 0)
    .sort((a, b) => b.opportunities - a.opportunities);

  return (
    <section aria-label="Tactics" className="card stats-section">
      <h2>Tactics</h2>
      {rows.length === 0 ? (
        <p>No tactical opportunities recorded yet.</p>
      ) : (
        <ul className="stats-section__motif-list">
          {rows.map((row) => {
            const pct = Math.round((row.found / row.opportunities) * 100);
            return (
              <li key={row.type} className="stats-section__motif-row">
                <span className="stats-section__motif-label">{MOTIF_LABELS[row.type]}</span>
                <span className="stats-section__motif-track">
                  <span className="stats-section__motif-bar" style={{ width: `${pct}%` }} />
                </span>
                <span className="stats-section__motif-value">
                  {row.found}/{row.opportunities}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
