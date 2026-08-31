import { TACTIC_MOTIF_TYPES, type TacticMotifCounts, type TacticMotifType } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { formatFraction } from './formatStat.js';
import { TACTICS_PANEL_IDS, TACTICS_TAB_IDS, TacticsTabs, type TacticsTab } from './TacticsTabs.js';

export interface TacticsStatsSectionProps {
  motifs: TacticMotifCounts;
}

/** chess.com's own category names for these motifs, per the user's original
 * request framing ("3 of them was best move forks... user found 2"). */
const MOTIF_LABELS: Record<TacticMotifType, string> = {
  checkmate: 'Checkmates',
  brilliantSacrifice: 'Brilliant Sacrifices',
  doubleCheck: 'Double Checks',
  fork: 'Forks',
  skewer: 'Skewers',
  pin: 'Pins',
  discoveredAttack: 'Discoveries',
  overloadedDefender: 'Overloaded Defenders',
  removesDefender: 'Removes Defender',
  weakBackRank: 'Weak Back-Rank',
  trappedPiece: 'Trapped Pieces',
  freePiece: 'Free Pieces',
  other: 'Other Tactics'
};

const EMPTY_STATE_LABELS: Record<TacticsTab, string> = {
  found: 'No tactical opportunities recorded yet.',
  prevented: 'No opponent tactics faced yet.'
};

/** Keeps the card's height stable once a user has enough games for every
 * motif to show up — the rest are one click away via "Show all". */
const VISIBLE_COUNT = 5;

interface MotifRow {
  type: TacticMotifType;
  opportunities: number;
  found: number;
  preventable?: number;
  prevented?: number;
}

/** Both tabs are the same "found N of M" shape: "Should Play" is
 * opportunities/found (the engine's #1 move was a tactic; did you play it),
 * "Prevented" is preventable/prevented (the opponent had a reachable
 * tactic; did you defuse it) — see computeTacticMotifPrevented. A motif
 * with no denominator for a tab (preventable undefined/0) is left out of
 * that tab entirely, same "not yet computed" convention as `valueFor`. */
function denominator(row: MotifRow, tab: TacticsTab): number {
  return tab === 'found' ? row.opportunities : (row.preventable ?? 0);
}

function numerator(row: MotifRow, tab: TacticsTab): number {
  return tab === 'found' ? row.found : (row.prevented ?? 0);
}

function rowsForTab(motifs: TacticMotifCounts, tab: TacticsTab): MotifRow[] {
  const all: MotifRow[] = TACTIC_MOTIF_TYPES.map((type) => ({ type, ...motifs[type] }));
  return all.filter((row) => denominator(row, tab) > 0).sort((a, b) => denominator(b, tab) - denominator(a, tab));
}

function valueFor(row: MotifRow, tab: TacticsTab): string {
  return formatFraction(numerator(row, tab), denominator(row, tab));
}

function pctFor(row: MotifRow, tab: TacticsTab): number {
  const total = denominator(row, tab);
  return total === 0 ? 0 : Math.round((numerator(row, tab) / total) * 100);
}

/** design.md's Tactics card (Task 30.2), split into Should-Play/Prevented
 * tabs — presentational only. */
export function TacticsStatsSection({ motifs }: TacticsStatsSectionProps): ReactNode {
  const [tab, setTab] = useState<TacticsTab>('found');
  const [showAll, setShowAll] = useState(false);

  function selectTab(next: TacticsTab): void {
    setTab(next);
    setShowAll(false);
  }

  const rows = rowsForTab(motifs, tab);
  const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_COUNT);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <section aria-label="Tactics" className="card stats-section">
      <h2>Tactics</h2>
      <TacticsTabs tab={tab} onSelect={selectTab} />
      <div id={TACTICS_PANEL_IDS[tab]} role="tabpanel" aria-labelledby={TACTICS_TAB_IDS[tab]}>
        {rows.length === 0 ? (
          <p>{EMPTY_STATE_LABELS[tab]}</p>
        ) : (
          <>
            <ul className="stats-section__motif-list">
              {visibleRows.map((row) => (
                <li key={row.type} className="stats-section__motif-row">
                  <span className="stats-section__motif-label">{MOTIF_LABELS[row.type]}</span>
                  <span className="stats-section__motif-track">
                    <span className="stats-section__motif-bar" style={{ width: `${pctFor(row, tab)}%` }} />
                  </span>
                  <span className="stats-section__motif-value">{valueFor(row, tab)}</span>
                </li>
              ))}
            </ul>
            {(hiddenCount > 0 || showAll) && rows.length > VISIBLE_COUNT && (
              <button type="button" className="btn-ghost stats-section__show-more" onClick={() => setShowAll((current) => !current)}>
                {showAll ? 'Show fewer' : `Show all ${rows.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
