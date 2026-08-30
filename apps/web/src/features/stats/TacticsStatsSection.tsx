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
  fork: 'Forks',
  pin: 'Pins',
  discoveredAttack: 'Discoveries',
  removesDefender: 'Removes Defender',
  trappedPiece: 'Trapped Pieces',
  freePiece: 'Free Pieces',
  other: 'Other Tactics'
};

const EMPTY_STATE_LABELS: Record<TacticsTab, string> = {
  found: 'No tactical opportunities recorded yet.',
  played: 'No tactics played yet.',
  prevented: 'No tactics prevented yet.'
};

/** Keeps the card's height stable once a user has enough games for every
 * motif to show up — the rest are one click away via "Show all". */
const VISIBLE_COUNT = 5;

interface MotifRow {
  type: TacticMotifType;
  opportunities: number;
  found: number;
  played?: number;
  prevented?: number;
}

/** Row set + sort order per tab. Found keeps its original "did any of this
 * motif ever come up as the engine's #1 suggestion" filter (opportunities >
 * 0); Played/Prevented also surface a motif the player pulled off or
 * defused even where it was never the engine's top choice (their whole
 * point is to differ from Found), so their filter is opportunities > 0 OR a
 * nonzero count of their own metric. */
function rowsForTab(motifs: TacticMotifCounts, tab: TacticsTab): MotifRow[] {
  const all: MotifRow[] = TACTIC_MOTIF_TYPES.map((type) => ({ type, ...motifs[type] }));
  if (tab === 'found') return all.filter((row) => row.opportunities > 0).sort((a, b) => b.opportunities - a.opportunities);
  return all
    .filter((row) => row.opportunities > 0 || (row[tab] ?? 0) > 0)
    .sort((a, b) => (b[tab] ?? -1) - (a[tab] ?? -1));
}

/** A motif with no recorded `played`/`prevented` count (older, un-reanalyzed
 * game data) shows "—", never a misleading "0". */
function valueFor(row: MotifRow, tab: TacticsTab): string {
  if (tab === 'found') return formatFraction(row.found, row.opportunities);
  const value = row[tab];
  return value === undefined ? '—' : String(value);
}

/** Found's bar is the literal found/opportunities percentage; Played/
 * Prevented have no natural denominator (a played tactic isn't framed as
 * "of N opportunities"), so their bar is scaled relative to the tab's own
 * largest visible count instead. */
function pctFor(row: MotifRow, tab: TacticsTab, maxValue: number): number {
  if (tab === 'found') return row.opportunities === 0 ? 0 : Math.round((row.found / row.opportunities) * 100);
  const value = row[tab];
  if (!value || maxValue === 0) return 0;
  return Math.round((value / maxValue) * 100);
}

/** design.md's Tactics card (Task 30.2), split into Played/Found/Prevented
 * tabs (chess.com's own terminology) — presentational only. */
export function TacticsStatsSection({ motifs }: TacticsStatsSectionProps): ReactNode {
  const [tab, setTab] = useState<TacticsTab>('found');
  const [showAll, setShowAll] = useState(false);

  function selectTab(next: TacticsTab): void {
    setTab(next);
    setShowAll(false);
  }

  const rows = rowsForTab(motifs, tab);
  const maxValue = tab === 'found' ? 0 : Math.max(0, ...rows.map((row) => row[tab] ?? 0));
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
                    <span className="stats-section__motif-bar" style={{ width: `${pctFor(row, tab, maxValue)}%` }} />
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
