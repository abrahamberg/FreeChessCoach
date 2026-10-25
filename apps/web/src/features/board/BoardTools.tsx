import { useEffect, useState, type ReactNode } from 'react';
import { FlipIcon } from '../../components/Icon.js';
import { OverflowMenu } from '../../components/OverflowMenu.js';
import { boardPng, boardPngFileName, downloadBlob } from './board-export.js';
import './BoardTools.css';

const NOTICE_MS = 1600;

export interface BoardToolsProps {
  /** The position on the board right now: the line being shown, not the game's last move. */
  fen: string;
  /** As the board is turned now, so the PNG matches what the student sees. */
  orientation: 'white' | 'black';
  onFlip: () => void;
}

/** A small pill in the board's top-right corner, on every board: flip in one
 * tap, and "⋮" for Copy FEN and Download PNG. Faint until the board is
 * hovered (BoardTools.css), so it never takes room from the board. */
export function BoardTools({ fen, orientation, onFlip }: BoardToolsProps): ReactNode {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function copyFen(): void {
    navigator.clipboard.writeText(fen).then(
      () => setNotice('FEN copied'),
      () => setNotice("Couldn't copy")
    );
  }

  function downloadPng(): void {
    boardPng(fen, orientation).then(
      (blob) => downloadBlob(blob, boardPngFileName(fen)),
      () => setNotice("Couldn't save the image")
    );
  }

  return (
    <div className="board-tools">
      {notice && (
        <span className="board-tools__notice" role="status">
          {notice}
        </span>
      )}
      <div className="board-tools__pill">
        <button type="button" className="board-tools__button" aria-label="Flip board" title="Flip board" onClick={onFlip}>
          <FlipIcon width={15} height={15} />
        </button>
        <OverflowMenu
          label="Export position"
          className="board-tools__menu"
          items={[
            { label: 'Copy FEN', onSelect: copyFen },
            { label: 'Download PNG', onSelect: downloadPng }
          ]}
        />
      </div>
    </div>
  );
}
