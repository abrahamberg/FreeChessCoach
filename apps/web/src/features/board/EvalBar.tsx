import type { CSSProperties, ReactNode } from 'react';
import { expectedPoints } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import './EvalBar.css';

export interface EvalBarProps {
  ply: number;
  classifiedMoves: ClassifiedMoveDto[];
  orientation: 'white' | 'black';
  /** 'vertical' (default) sits beside the board, filling bottom-up/top-down
   * — the classic lichess/chess.com layout, and what every desktop/tablet
   * caller wants. 'horizontal' lays the same gauge out as a slim strip
   * ABOVE the board instead, for the narrow single-column mobile layout
   * (design ask: keep the eval indicator without the vertical bar eating
   * into the board's own width, which is the scarcer dimension there). */
  layout?: 'vertical' | 'horizontal';
}

/** lichess/chess.com-style evaluation bar next to (or, in `horizontal`
 * layout, above) the board. Reads straight from classifiedMoves (already
 * loaded with the game, white-perspective cp, mate pre-clamped to +-1000 —
 * see classify.ts), so it needs no fetch of its own: ply 0 has no classified
 * move yet and defaults to an even 0cp start. Presentational only (AGENTS.md
 * rule 7) — the parent owns which ply/classifiedMoves/layout to pass in. */
export function EvalBar({ ply, classifiedMoves, orientation, layout = 'vertical' }: EvalBarProps): ReactNode {
  const cp = classifiedMoves.find((move) => move.ply === ply)?.evalAfterCp ?? 0;
  const whitePercent = expectedPoints(cp) * 100;
  // The white-fill segment tracks the board flip: white's pieces sit at the
  // bottom (vertical) / right (horizontal) when orientation is 'white'
  // (unflipped), at the top / left when it's 'black' (flipped) — so the bar
  // always fills from whichever edge white actually occupies.
  const fillStyle: CSSProperties =
    layout === 'horizontal'
      ? orientation === 'white'
        ? { width: `${whitePercent}%`, right: 0 }
        : { width: `${whitePercent}%`, left: 0 }
      : orientation === 'white'
        ? { height: `${whitePercent}%`, bottom: 0 }
        : { height: `${whitePercent}%`, top: 0 };

  return (
    <div className={`eval-bar-wrap${layout === 'horizontal' ? ' eval-bar-wrap--horizontal' : ''}`}>
      <div className="eval-bar" aria-label={`Evaluation: ${formatEval(cp)}`}>
        <div className="eval-bar__fill" style={fillStyle} />
      </div>
      <span className="eval-bar__label">{formatEval(cp)}</span>
    </div>
  );
}

function formatEval(cp: number): string {
  const pawns = cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}
