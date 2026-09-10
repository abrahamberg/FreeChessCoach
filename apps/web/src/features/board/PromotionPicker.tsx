import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { defaultPieces } from 'react-chessboard';
import './PromotionPicker.css';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

const PROMOTION_ORDER: PromotionPiece[] = ['q', 'n', 'r', 'b'];
const PROMOTION_LABEL: Record<PromotionPiece, string> = { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' };

export interface PromotionPickerProps {
  /** The pawn's destination square (e.g. "e8") — the picker anchors to its file. */
  square: string;
  color: 'w' | 'b';
  orientation: 'white' | 'black';
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

function fileIndex(square: string): number {
  return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

/** A pawn only ever promotes on rank 1 or 8, which after flipping for
 * orientation always lands on the very top or very bottom row — never
 * in between — so this is enough to decide which edge to hug. */
function isTopEdge(square: string, orientation: 'white' | 'black'): boolean {
  return orientation === 'white' ? square[1] === '8' : square[1] === '1';
}

function columnFor(square: string, orientation: 'white' | 'black'): number {
  const file = fileIndex(square);
  return orientation === 'white' ? file : 7 - file;
}

/** CoachBoard's own promotion UI (chess.js has no opinion on this — it just
 * accepts whichever promotion piece a move specifies) — the classic
 * lichess/chess.com column of four pieces anchored over the promoting
 * pawn's file. Overlays `.coach-board-frame` (its positioned ancestor)
 * rather than a page-level Modal, so it reads as belonging to the board,
 * not as an unrelated dialog. */
export function PromotionPicker({ square, color, orientation, onSelect, onCancel }: PromotionPickerProps): ReactNode {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const style = isTopEdge(square, orientation)
    ? { left: `${columnFor(square, orientation) * 12.5}%`, top: 0 }
    : { left: `${columnFor(square, orientation) * 12.5}%`, bottom: 0 };

  return (
    <div className="promotion-picker-backdrop" onClick={onCancel}>
      <div
        className="promotion-picker"
        style={style}
        role="menu"
        aria-label="Choose a piece to promote to"
        onClick={(event) => event.stopPropagation()}
      >
        {PROMOTION_ORDER.map((piece) => {
          const PieceIcon = defaultPieces[`${color}${piece.toUpperCase()}`];
          return (
            <button
              key={piece}
              type="button"
              role="menuitem"
              className="promotion-picker__option"
              aria-label={PROMOTION_LABEL[piece]}
              onClick={() => onSelect(piece)}
            >
              {PieceIcon && <PieceIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
