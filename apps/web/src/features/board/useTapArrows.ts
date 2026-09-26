import { useEffect, useState } from 'react';
import type { BoardArrow } from './CoachBoard.js';

/** react-chessboard's own colour for a right-click-drawn arrow, so a tapped
 * arrow looks the same as a drawn one. */
const TAP_ARROW_COLOR = '#ffaa00';

export interface TapArrows {
  /** The square tapped first, waiting for the second tap — null otherwise. */
  startSquare: string | null;
  arrows: BoardArrow[];
  /** One tap: the first picks the start, the second draws the arrow (or
   * erases it, if that arrow is already there); tapping the start again
   * cancels. */
  tap: (square: string) => void;
}

/**
 * Tap-to-draw arrows — react-chessboard only draws arrows with a right-click
 * drag, which a phone doesn't have. Only for boards whose taps have nothing
 * else to do (a locked board); cleared whenever the position changes, like
 * the drawn ones.
 */
export function useTapArrows(fen: string): TapArrows {
  const [startSquare, setStartSquare] = useState<string | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);

  useEffect(() => {
    setStartSquare(null);
    setArrows([]);
  }, [fen]);

  function tap(square: string): void {
    if (startSquare === null) {
      setStartSquare(square);
      return;
    }
    setStartSquare(null);
    if (square === startSquare) return;
    const from = startSquare;
    setArrows((current) =>
      current.some((arrow) => arrow.from === from && arrow.to === square)
        ? current.filter((arrow) => !(arrow.from === from && arrow.to === square))
        : [...current, { from, to: square, color: TAP_ARROW_COLOR }]
    );
  }

  return { startSquare, arrows, tap };
}
