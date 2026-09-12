import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/Icon.js';
import { MoveStrip } from './MoveStrip.js';
import './MoveNavStrip.css';

export interface MoveNavStripProps {
  sanMoves: string[];
  classifiedMoves: ClassifiedMoveDto[];
  /** ply-indexed positions (ply 0 = game start) — passed straight through to
   * MoveStrip's own move-analysis inspector. */
  positions: { ply: number; fen: string }[];
  /** 1-based halfmove ply (0 = start position) — GameReviewPage's own
   * convention everywhere else on that page. */
  ply: number;
  onSelect: (ply: number) => void;
}

/** The mobile Review layout used to stack MoveNavPills' first/prev/"N of
 * M"/next/last controls directly above MoveStrip's own scrollable move-chip
 * list — two rows doing overlapping jobs (both step through the same moves)
 * that cost the board a whole row of vertical space. This collapses them
 * into one: MoveStrip keeps the chip list (already scrolls the current move
 * into view on its own — design-improvements.md §4.2), flanked by a pair of
 * step buttons for one-move-at-a-time navigation without hunting for a
 * specific chip. The "N of M" readout and first/last skips are dropped
 * rather than folded in — the chip list already shows exactly where you are
 * and lets you jump anywhere directly. */
export function MoveNavStrip({ sanMoves, classifiedMoves, positions, ply, onSelect }: MoveNavStripProps): ReactNode {
  const totalPlies = sanMoves.length;

  function goTo(next: number): void {
    onSelect(Math.min(Math.max(next, 0), totalPlies));
  }

  return (
    <div className="move-nav-strip">
      <button
        type="button"
        className="move-nav-strip__step"
        aria-label="previous move"
        onClick={() => goTo(ply - 1)}
        disabled={ply <= 0}
      >
        <ChevronLeftIcon width={20} height={20} />
      </button>
      <MoveStrip
        sanMoves={sanMoves}
        classifiedMoves={classifiedMoves}
        positions={positions}
        currentPly={ply - 1}
        momentPlies={[]}
        onSelect={(index) => onSelect(index + 1)}
      />
      <button
        type="button"
        className="move-nav-strip__step"
        aria-label="next move"
        onClick={() => goTo(ply + 1)}
        disabled={ply >= totalPlies}
      >
        <ChevronRightIcon width={20} height={20} />
      </button>
    </div>
  );
}
