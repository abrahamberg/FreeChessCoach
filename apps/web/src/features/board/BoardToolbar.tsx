import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardIcon, DownloadIcon, FlipIcon } from '../../components/Icon.js';
import type { OverflowMenuItem } from '../../components/OverflowMenu.js';
import { boardPng, boardPngFileName, downloadBlob } from './board-export.js';
import { useBoardTools, type ShownBoard } from './board-tools-context.js';
import './BoardToolbar.css';

const NOTICE_MS = 1600;

function copyFen(board: ShownBoard): Promise<void> {
  return navigator.clipboard.writeText(board.fen);
}

async function savePng(board: ShownBoard): Promise<void> {
  downloadBlob(await boardPng(board.fen, board.orientation), boardPngFileName(board.fen));
}

/** The row of board actions at the bottom of a board page's side column
 * (under the chat input, the coach's note, the bot's status), as lichess
 * keeps them under its side panel: never on the board itself. New board
 * actions go here, and in useBoardMenuItems for the phone. Renders nothing
 * on a page without a board. */
export function BoardToolbar(): ReactNode {
  const { board, flip } = useBoardTools();
  const [notice, setNotice] = useState<{ action: 'fen' | 'png'; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!board) return null;

  function labelOf(action: 'fen' | 'png', label: string): string {
    return notice?.action === action ? notice.text : label;
  }

  return (
    <div className="board-toolbar" role="toolbar" aria-label="Board">
      <button type="button" className="board-toolbar__button" onClick={flip}>
        <FlipIcon width={15} height={15} />
        Flip board
      </button>
      <button
        type="button"
        className="board-toolbar__button"
        onClick={() =>
          copyFen(board).then(
            () => setNotice({ action: 'fen', text: 'Copied' }),
            () => setNotice({ action: 'fen', text: "Couldn't copy" })
          )
        }
      >
        <ClipboardIcon width={15} height={15} />
        <span aria-live="polite">{labelOf('fen', 'Copy FEN')}</span>
      </button>
      <button
        type="button"
        className="board-toolbar__button"
        onClick={() => savePng(board).catch(() => setNotice({ action: 'png', text: "Couldn't save" }))}
      >
        <DownloadIcon width={15} height={15} />
        <span aria-live="polite">{labelOf('png', 'Download PNG')}</span>
      </button>
    </div>
  );
}

/** The same actions for a header menu (BoardMenu): the phone has no side
 * column to hold BoardToolbar. Empty on a page without a board. */
export function useBoardMenuItems(): OverflowMenuItem[] {
  const { board, flip } = useBoardTools();
  return useMemo(
    () =>
      board
        ? [
            { label: 'Flip board', onSelect: flip },
            { label: 'Copy FEN', onSelect: () => void copyFen(board).catch(() => undefined) },
            { label: 'Download PNG', onSelect: () => void savePng(board).catch(() => undefined) }
          ]
        : [],
    [board, flip]
  );
}
