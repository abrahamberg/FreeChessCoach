import type { ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, SkipBackIcon, SkipForwardIcon } from '../../components/Icon.js';

export interface MoveNavPillsProps {
  ply: number;
  totalPlies: number;
  onSelect: (ply: number) => void;
}

/** The mobile Review layout's own first/prev/next/last controls — MoveStrip
 * is a scrollable chip list with no equivalent, so without this there was
 * no way to step one move at a time without either scrubbing the strip by
 * hand or tapping a specific chip. Reuses MoveExplorer's own
 * .move-explorer__nav/__position markup verbatim (same 1-based `ply` this
 * page already uses everywhere, so no index translation needed here unlike
 * MoveStrip's own 0-based one). */
export function MoveNavPills({ ply, totalPlies, onSelect }: MoveNavPillsProps): ReactNode {
  function goTo(next: number): void {
    onSelect(Math.min(Math.max(next, 0), totalPlies));
  }

  return (
    <div className="move-explorer__nav">
      <button type="button" aria-label="first move" onClick={() => goTo(0)} disabled={ply <= 0}>
        <SkipBackIcon width={15} height={15} />
      </button>
      <button type="button" aria-label="previous move" onClick={() => goTo(ply - 1)} disabled={ply <= 0}>
        <ChevronLeftIcon width={16} height={16} />
      </button>
      <span className="move-explorer__position">
        move {ply} of {totalPlies}
      </span>
      <button type="button" aria-label="next move" onClick={() => goTo(ply + 1)} disabled={ply >= totalPlies}>
        <ChevronRightIcon width={16} height={16} />
      </button>
      <button type="button" aria-label="last move" onClick={() => goTo(totalPlies)} disabled={ply >= totalPlies}>
        <SkipForwardIcon width={15} height={15} />
      </button>
    </div>
  );
}
